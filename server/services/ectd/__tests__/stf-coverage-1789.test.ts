/**
 * FDA eCTD validation 1789 — a file in a study section must be referenced by a
 * Study Tagging File (g-stf-1789-fail-closed, findings 36 and 56).
 *
 * FDA's TRC material (regulator text, read through search, 2026-10-05:
 * fda.gov/media/160970, 165675, 135247): 1789 fires when "a file has been
 * submitted in a study section without providing an STF file"; STFs are not
 * required for 4.3, 5.2, 5.3.6 and 5.4. High severity: a technical rejection.
 *
 * Before this change:
 *  - the packager kept only leaves that already had studyId + stfFileTag, so an
 *    untagged CSR in 5.3.5.1 shipped with no STF and `bundle.stf.untagged` was
 *    always 0;
 *  - auditStudyIdTagging accepted `lifecycleOperator` as a study id and
 *    reported only a warning;
 *  - qualify reported an untagged study leaf as a warning.
 *
 * One check now decides coverage: `auditStfCoverage` (ectd4-validator.ts),
 * called by the packager, by auditStudyIdTagging, and read by qualify through
 * the bundle.
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { auditStfCoverage, type ECTDLeaf } from '../ectd4-validator';
import { auditStudyIdTagging } from '../ectd-validator-hardening';
import { stfCoverageFindings } from '../qualification/qualify';
import { packageEctdSubmission, type EctdLeaf } from '../../submission-gateways/regional-packager';
import { ValidationError } from '../../submission-gateways/types';

const ectdLeaf = (over: Partial<ECTDLeaf> & { sectionCode: string }): ECTDLeaf => ({
  title: 'Study report',
  checksum: 'a'.repeat(32),
  checksumType: 'md5',
  operation: 'new',
  filePath: 'm5/53/535/csr.pdf',
  mimeType: 'application/pdf',
  fileSize: 100,
  ...over,
});

describe('auditStudyIdTagging — TRC 1789, no stand-in study id', () => {
  it('a 5.3.5.1 leaf whose only "id" is its lifecycle operator is an error citing 1789', () => {
    const findings = auditStudyIdTagging([ectdLeaf({ sectionCode: 'm5.3.5.1', lifecycleOperator: 'new' })]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].code).toBe('STF_MISSING_STUDY_ID');
    expect(findings[0].rule).toMatch(/FDA TRC 1789/);
  });

  it('is an error for a US sequence and a warning for an EU one', () => {
    const l = [ectdLeaf({ sectionCode: 'm5.3.1.2' })];
    expect(auditStudyIdTagging(l, 'US')[0].severity).toBe('error');
    expect(auditStudyIdTagging(l, 'EU')[0].severity).toBe('warning');
  });

  it('covers every M4/M5 section 1789 names, including 4.2.3.7 and 5.3.7', () => {
    for (const sectionCode of ['m4.2.1.1', 'm4.2.3.7', 'm5.3.3.1', 'm5.3.5.4', 'm5.3.7']) {
      const f = auditStudyIdTagging([ectdLeaf({ sectionCode })]);
      expect(f.map((x) => x.severity), sectionCode).toEqual(['error']);
    }
  });

  it('says nothing about 4.3, 5.2, 5.3.6 and 5.4, which need no STF, nor about M1-M3', () => {
    for (const sectionCode of ['m4.3', 'm5.2', 'm5.3.6', 'm5.4', 'm3.2.S.1', 'm2.7.3', 'm1.2']) {
      expect(auditStudyIdTagging([ectdLeaf({ sectionCode })]), sectionCode).toEqual([]);
    }
  });

  it('a leaf with a real study id passes; a delete ships no file and is not checked', () => {
    expect(auditStudyIdTagging([ectdLeaf({ sectionCode: 'm5.3.5.1', studyId: 'ABC-301' })])).toEqual([]);
    expect(auditStudyIdTagging([ectdLeaf({ sectionCode: 'm5.3.5.1', operation: 'delete' })])).toEqual([]);
  });
});

describe('auditStfCoverage — the one coverage check', () => {
  it('is exported from the leaf validator', () => {
    expect(typeof auditStfCoverage).toBe('function');
  });

  it('when the caller models file-tags, a study id without a tag is still not covered', () => {
    const f = auditStfCoverage(
      [{ section: '5.3.5.1', title: 'CSR', studyId: 'ABC-301' }],
      { region: 'fda', fileTagModelled: true },
    );
    expect(f.map((x) => [x.severity, x.code])).toEqual([['error', 'STF_MISSING_FILE_TAG']]);
  });
});

function pdf(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');
}

async function pack(region: 'fda' | 'ema', extra: Array<Partial<EctdLeaf> & { ctdSection: string; fileName: string }>) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'stf1789-'));
  const src = path.join(work, 'src');
  await fs.mkdir(src, { recursive: true });
  const mk = async (name: string) => {
    const p = path.join(src, name);
    await fs.writeFile(p, pdf(name));
    return p;
  };
  const leaves: EctdLeaf[] = [
    { ctdSection: '1.2', operation: 'new', sourcePath: await mk('cover.pdf'), fileName: 'cover.pdf', title: 'Cover' },
    {
      ctdSection: '5.3.5.1', operation: 'new', sourcePath: await mk('s1-report.pdf'), fileName: 's1-report.pdf',
      title: 'Study 1 report', studyId: 'STUDY-001', stfFileTag: 'study-report',
    },
  ];
  for (const e of extra) {
    leaves.push({ operation: 'new', title: e.fileName, sourcePath: await mk(e.fileName), ...e } as EctdLeaf);
  }
  const run = () =>
    packageEctdSubmission({
      region, applicationId: '123456', sequence: '0000', submissionType: 'original',
      ...(region === 'fda' ? { fda: { applicationType: 'nda' as const } } : {}),
      sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, 'out'),
      environment: 'staging', leaves,
    });
  return { work, run };
}

describe('regional packager — a study file with no STF', () => {
  it('FDA: an untagged 5.3.5.1 report refuses the package, citing 1789 and naming the file', async () => {
    const { work, run } = await pack('fda', [{ ctdSection: '5.3.5.1', fileName: 's2-report.pdf' }]);
    try {
      const err = await run().then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).toMatch(/1789/);
      expect((err as Error).message).toContain('s2-report.pdf');
      expect((err as ValidationError).findings).toEqual(
        expect.arrayContaining([expect.objectContaining({ ruleId: 'FDA-TRC-1789', severity: 'error', filePath: 's2-report.pdf' })]),
      );
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('FDA: a study id with no file-tag is refused too (the leaf would be in no STF)', async () => {
    const { work, run } = await pack('fda', [{ ctdSection: '4.2.3.2', fileName: 'tox.pdf', studyId: 'TOX-01' }]);
    try {
      await expect(run()).rejects.toThrow(/1789[\s\S]*tox\.pdf|tox\.pdf[\s\S]*1789/);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('FDA: 5.3.6 postmarketing reports and 5.4 literature need no STF and package', async () => {
    const { work, run } = await pack('fda', [
      { ctdSection: '5.3.6', fileName: 'psur.pdf' },
      { ctdSection: '5.4', fileName: 'ref.pdf' },
    ]);
    try {
      const bundle = await run();
      expect(bundle.stf).toEqual({ studies: 1, leaves: 1, untagged: 0 });
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('EMA: the untagged report packages, and the bundle counts it instead of hiding it', async () => {
    const { work, run } = await pack('ema', [{ ctdSection: '5.3.5.1', fileName: 's2-report.pdf' }]);
    try {
      const bundle = await run();
      expect(bundle.stf).toEqual({ studies: 1, leaves: 1, untagged: 1 });
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});

describe('qualify — an uncovered study file is an error, not a warning', () => {
  it('stfCoverageFindings reports untagged study files as errors citing 1789', () => {
    const f = stfCoverageFindings({ untagged: 3 });
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('error');
    expect(f[0].message).toMatch(/3 .*1789/);
    expect(stfCoverageFindings({ untagged: 0 })).toEqual([]);
  });
});
