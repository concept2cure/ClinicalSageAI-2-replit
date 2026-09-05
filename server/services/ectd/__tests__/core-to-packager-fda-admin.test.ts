/**
 * FDA us-regional admin block from canonical-core rows.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The packager received `submissionType: submission.applicationType` — the
 * string 'ind' — and matched it against the us-regional submission-type
 * vocabulary, whose only entry containing "IND" is fdast9 · IND Safety Reports.
 * Every IND sequence therefore left the packager coded as an IND safety report.
 * The submission type is a property of the sequence, not the application.
 *
 * The first block pins the derivation; the last block proves it reaches the
 * emitted us-regional.xml, and shows the old coding on the input the old
 * path produced (so the gate is seen failing on the case it exists to catch).
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { buildPackagerInputFromCore, fdaSubmissionTypeFor, type CoreLeaf } from '../core-to-packager';
import { packageEctdSubmission } from '../../submission-gateways/regional-packager';
import { resolveSubmissionTypeCode } from '../controlled-vocab';

const leaf = (over: Partial<CoreLeaf> & { sectionCode: string }): CoreLeaf => ({
  title: over.title ?? over.sectionCode,
  lifecycleOp: over.lifecycleOp ?? 'new',
  ...over,
});

describe('fdaSubmissionTypeFor — the sequence decides the submission type', () => {
  it('an original IND sequence is an Original Application, sub-type original', () => {
    expect(fdaSubmissionTypeFor({ sequenceNumber: '0000', region: 'fda', type: 'original' }, [])).toEqual({
      submissionType: 'original',
      submissionSubType: 'original',
    });
  });

  it('a sequence with no type recorded is treated as an original', () => {
    expect(fdaSubmissionTypeFor({ sequenceNumber: '0000', region: 'fda' }, []).submissionType).toBe('original');
  });

  it('an amendment / response sequence is an Original Application, sub-type amendment', () => {
    for (const type of ['amendment', 'response', 'variation']) {
      expect(fdaSubmissionTypeFor({ sequenceNumber: '0003', region: 'fda', type }, [])).toEqual({
        submissionType: 'original',
        submissionSubType: 'amendment',
      });
    }
  });

  it('an annual sequence is an Annual Report', () => {
    expect(fdaSubmissionTypeFor({ sequenceNumber: '0007', region: 'fda', type: 'annual' }, [])).toEqual({
      submissionType: 'annual',
      submissionSubType: 'original',
    });
  });

  it('a sequence carrying a safety-report leaf is an IND Safety Report, whatever its type says', () => {
    const leaves = [leaf({ sectionCode: '1.13', documentType: 'ind_safety_report' })];
    expect(fdaSubmissionTypeFor({ sequenceNumber: '0004', region: 'fda', type: 'amendment' }, leaves).submissionType).toBe(
      'ind_safety_report',
    );
    expect(fdaSubmissionTypeFor({ sequenceNumber: '0004', region: 'fda', type: 'amendment' }, [leaf({ sectionCode: '5.3.5.1', documentType: 'icsr' })]).submissionType).toBe(
      'ind_safety_report',
    );
  });

  it('every derived value resolves to the us-regional code the FDA vocabulary defines', () => {
    expect(resolveSubmissionTypeCode('original')).toBe('fdast1');
    expect(resolveSubmissionTypeCode('annual')).toBe('fdast5');
    expect(resolveSubmissionTypeCode('ind_safety_report')).toBe('fdast9');
    // The old input — the application type — is exactly what produced fdast9.
    expect(resolveSubmissionTypeCode('ind')).toBe('fdast9');
  });
});

describe('buildPackagerInputFromCore — the fda admin block', () => {
  const args = {
    submission: { applicationType: 'ind', productName: 'P' },
    resolveFile: () => ({ fileName: 'x.pdf', sourcePath: '/tmp/x.pdf' }),
    applicationId: '123456',
    sponsorId: 'D',
    sponsorName: 'S',
    outputDir: '/tmp/out',
  };

  it('carries the application type and the sequence-derived submission type for an FDA sequence', () => {
    const { input } = buildPackagerInputFromCore({
      ...args,
      sequence: { sequenceNumber: '0000', region: 'fda', type: 'original' },
      leaves: [leaf({ sectionCode: '1.2' })],
    });
    expect(input.fda).toEqual({ applicationType: 'ind', submissionType: 'original', submissionSubType: 'original' });
  });

  it('codes an annual sequence as an annual report', () => {
    const { input } = buildPackagerInputFromCore({
      ...args,
      sequence: { sequenceNumber: '0002', region: 'fda', type: 'annual' },
      leaves: [leaf({ sectionCode: '1.13' })],
    });
    expect(input.fda?.submissionType).toBe('annual');
  });

  it('adds no fda block for a non-FDA sequence', () => {
    const { input } = buildPackagerInputFromCore({
      ...args,
      sequence: { sequenceNumber: '0000', region: 'eu', type: 'original' },
      leaves: [leaf({ sectionCode: '1.0' })],
    });
    expect(input.fda).toBeUndefined();
  });
});

describe('us-regional.xml — the emitted submission-type follows the sequence', () => {
  function pdf(label: string): Buffer {
    return Buffer.from(`%PDF-1.4\n% ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');
  }

  async function emittedAdmin(sequenceType: string, opts: { withFdaBlock: boolean }) {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-fda-admin-'));
    try {
      const bytes = pdf('cover');
      const src = path.join(work, 'cover.pdf');
      await fs.writeFile(src, bytes);
      const { input } = buildPackagerInputFromCore({
        sequence: { sequenceNumber: '0000', region: 'fda', type: sequenceType },
        submission: { applicationType: 'ind', productName: 'P' },
        leaves: [leaf({ sectionCode: '1.2', title: 'Cover Letter' })],
        resolveFile: () => ({ fileName: 'cover.pdf', sourcePath: src, md5: createHash('md5').update(bytes).digest('hex') }),
        applicationId: '123456',
        sponsorId: 'D',
        sponsorName: 'S',
        outputDir: path.join(work, 'out'),
      });
      if (!opts.withFdaBlock) delete (input as { fda?: unknown }).fda; // the pre-fix input
      const bundle = await packageEctdSubmission({ ...input, environment: 'staging' });
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const xml = await zip.file('m1/us/us-regional.xml')!.async('string');
      return {
        applicationType: /application-type="([^"]+)"/.exec(xml)?.[1],
        submissionType: /submission-type="([^"]+)"/.exec(xml)?.[1],
        subType: /submission-sub-type="([^"]+)"/.exec(xml)?.[1],
      };
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }

  it('without the fda block the old input coded an original IND as an IND safety report (the defect)', async () => {
    const admin = await emittedAdmin('original', { withFdaBlock: false });
    expect(admin.submissionType).toBe('fdast9');
  });

  it('an original IND sequence is emitted as fdaat4 / fdast1 / fdasst1', async () => {
    const admin = await emittedAdmin('original', { withFdaBlock: true });
    expect(admin).toEqual({ applicationType: 'fdaat4', submissionType: 'fdast1', subType: 'fdasst1' });
  });

  it('an amendment is emitted as fdast1 with sub-type fdasst4; an annual report as fdast5', async () => {
    expect(await emittedAdmin('amendment', { withFdaBlock: true })).toMatchObject({ submissionType: 'fdast1', subType: 'fdasst4' });
    expect(await emittedAdmin('annual', { withFdaBlock: true })).toMatchObject({ submissionType: 'fdast5' });
  });
});
