/**
 * eCTD qualification harness — end-to-end proof for both versions.
 *
 * This is also the integration test for the (refactored) regional packager and
 * the v4.0 RPS packager: it generates golden packages, validates their
 * backbones with the REAL xmllint parser, exercises a replace/delete/append
 * lifecycle sequence, and reopens each ZIP to re-verify every checksum.
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runQualification, qualifyV3, qualifyV4 } from '../index';
import type { Region } from '../../../submission-gateways/regional-packager';

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ectd-qual-test-'));
}

describe('eCTD v3.2.2 qualification', () => {
  it('generates a well-formed, checksum-verified FDA package with a working lifecycle', async () => {
    const work = await tmp();
    try {
      const r = await qualifyV3('fda', work);
      // Backbone XML is well-formed (real xmllint).
      const wf = r.validators.filter((v) => v.name.includes('well-formed'));
      expect(wf.length).toBeGreaterThanOrEqual(2); // index.xml + us-regional.xml
      for (const v of wf) expect(v.passed).toBe(true);
      // Every checksum in util/index-md5.txt re-verified after reopening the ZIP.
      expect(r.checksum.ok).toBe(true);
      expect(r.checksum.filesChecked).toBeGreaterThan(0);
      expect(r.checksum.mismatches).toEqual([]);
      // Lifecycle sequence (replace/delete/append) packages + verifies.
      expect(r.lifecycle.operations).toContain('replace');
      expect(r.lifecycle.nextPackagePassed).toBe(true);
      expect(r.passed).toBe(true);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it.each(['ema', 'pmda', 'ca'] as Region[])('qualifies region %s (well-formed + checksums)', async (region) => {
    const work = await tmp();
    try {
      const r = await qualifyV3(region, work);
      expect(r.checksum.ok).toBe(true);
      for (const v of r.validators.filter((x) => x.name.includes('well-formed'))) {
        expect(v.passed).toBe(true);
      }
      expect(r.passed).toBe(true);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});

describe('eCTD v4.0 qualification', () => {
  it('generates a well-formed RPS package, verifies checksums + in-message integrity, and a lifecycle revise', async () => {
    const work = await tmp();
    try {
      const r = await qualifyV4(work);
      expect(r.version).toBe('v4.0');
      // RPS model validator passes; message is well-formed.
      const model = r.validators.find((v) => v.name === 'rps-model-validator');
      expect(model?.passed).toBe(true);
      const wf = r.validators.find((v) => v.name.includes('well-formed'));
      if (wf) expect(wf.passed).toBe(true);
      // Package checksums + per-document SHA-256 integrity re-verified.
      expect(r.checksum.ok).toBe(true);
      expect(r.notes.some((n) => n.includes('integrity mismatch'))).toBe(false);
      // Lifecycle revise references prior CoUs and validates.
      expect(r.lifecycle.nextPackagePassed).toBe(true);
      expect(r.passed).toBe(true);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});

describe('runQualification (full suite, preserved reports)', () => {
  it('runs FDA v3 + v4 and writes reports with exact spec versions', async () => {
    const work = await tmp();
    const reportDir = path.join(work, 'reports');
    try {
      const summary = await runQualification({
        v3Regions: ['fda'],
        includeV4: true,
        reportDir,
        workDir: work,
        ranAt: '2026-07-30T00:00:00.000Z',
      });
      expect(summary.passed).toBe(true);
      expect(summary.reports.length).toBe(2);
      // Reports were preserved with the exact qualified spec versions.
      const v3 = JSON.parse(await fs.readFile(path.join(reportDir, 'v3.2.2-fda.json'), 'utf8'));
      expect(v3.specVersions.validationCriteria).toContain('v4.5');
      expect(v3.specVersions.fdaRegionalDtd).toContain('v3.3');
      const v4 = JSON.parse(await fs.readFile(path.join(reportDir, 'v4.0-fda.json'), 'utf8'));
      expect(v4.specVersions.fdaRegionalIg).toContain('18.8');
      expect(await fs.readFile(path.join(reportDir, 'summary.json'), 'utf8')).toContain('"passed"');
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 60000);
});
