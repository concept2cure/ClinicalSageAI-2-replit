/**
 * The FDA regional backbone must not declare a filing identity nobody supplied.
 *
 * ── The defect this exists to close ──────────────────────────────────────────
 * `buildFdaBackbone` resolved the application-type attribute like this:
 *
 *   resolveApplicationTypeCode(fda.applicationType ?? '') ??
 *   resolveApplicationTypeCode(input.submissionType) ??
 *   'fdaat1'
 *
 * `fdaat1` is NDA. The lookup table covers nda/snda/anda/bla/ind/dmf/mf/bmf,
 * and applicationTypeToFdaCode's own contract says it "returns null for unknown
 * values so callers can fail closed rather than mislabel an application" — a
 * rule stated at the definition and broken at its only call site. So `510k`,
 * `de_novo`, `pma`, `maa` and `cta` — all values shared/schema/submissions.ts
 * enumerates and the UI offers — resolved to null and were filed as
 * `application-type="fdaat1"`: a device dossier declaring itself a New Drug
 * Application in the backbone field the ESG routes on.
 *
 * The submission-type attribute had a second, subtler version of the same
 * fault. It fell back to `resolveSubmissionTypeCode(input.submissionType)`,
 * feeding an APPLICATION type into the SUBMISSION-type vocabulary. The only
 * fdast entry containing "IND" is `fdast9 · IND Safety Reports`, so every
 * orchestrator-packaged IND sequence — original, amendment, annual report —
 * declared itself an IND safety report. core-to-packager.ts fixed this for the
 * path that supplies an explicit `fda` block; the orchestrator supplies none,
 * so the cross-vocabulary guess was still live here.
 *
 * Both now fail closed. A package that cannot state what it is does not ship.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { packageEctdSubmission, type EctdLeaf } from '../regional-packager';

const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

async function pack(over: { submissionType: string; sequence?: string }) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'fda-identity-'));
  const bytes = Buffer.from('%PDF-1.7\n% cover letter\n');
  const src = path.join(work, 'cover.pdf');
  await fs.writeFile(src, bytes);
  const leaves: EctdLeaf[] = [
    {
      operation: 'new',
      ctdSection: '1.2',
      fileName: 'cover.pdf',
      md5: md5(bytes),
      title: 'Cover Letter',
      sourcePath: src,
    },
  ];
  return packageEctdSubmission({
    region: 'fda',
    applicationId: '123456',
    sequence: over.sequence ?? '0000',
    submissionType: over.submissionType,
    sponsorId: 'D',
    sponsorName: 'S',
    productName: 'P',
    outputDir: path.join(work, 'out'),
    environment: 'staging',
    leaves,
  });
}

async function regionalXml(bundlePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(bundlePath));
  const name = Object.keys(zip.files).find((n) => n.endsWith('us-regional.xml'));
  expect(name, 'package contains a us-regional.xml').toBeTruthy();
  return zip.file(name!)!.async('string');
}

describe('FDA backbone declares only a filing identity it was given', () => {
  it('refuses to file a 510(k) as a New Drug Application', async () => {
    /* The severe case. `510k` is an enumerated applicationType with no entry in
       the eCTD Module 1 application-type vocabulary — because a 510(k) is not
       filed on this backbone at all. Defaulting it to fdaat1 did not make it
       filable; it made it a mislabelled NDA. */
    // The packager normalizes the pathway label upstream, so the refusal names
    // it as "510(k)" — the point is that it names the value it could not map.
    await expect(pack({ submissionType: '510k' })).rejects.toThrow(/510\(k\)/);
    await expect(pack({ submissionType: '510k' })).rejects.toThrow(
      /application-type|filing identity/i,
    );
  }, 60_000);

  it('refuses pma, de_novo, maa and cta for the same reason', async () => {
    for (const t of ['pma', 'de_novo', 'maa', 'cta']) {
      await expect(pack({ submissionType: t }), t).rejects.toThrow(/application-type/i);
    }
  }, 60_000);

  it('never emits fdaat1 for anything that is not actually an NDA', async () => {
    /* The assertion that would have caught the original defect directly. */
    for (const t of ['ind', 'bla', 'anda']) {
      const xml = await regionalXml((await pack({ submissionType: t })).path);
      expect(xml, t).not.toMatch(/application-type="fdaat1"/);
    }
    const nda = await regionalXml((await pack({ submissionType: 'nda' })).path);
    expect(nda).toMatch(/application-type="fdaat1"/);
  }, 60_000);

  it('an original IND is not declared an IND Safety Report', async () => {
    /* fdast9 is "IND Safety Reports". It was reached by resolving the
       APPLICATION type through the SUBMISSION-type vocabulary. */
    const xml = await regionalXml((await pack({ submissionType: 'ind' })).path);
    expect(xml).toMatch(/application-type="fdaat4"/); // IND
    expect(xml).not.toMatch(/submission-type="fdast9"/);
    expect(xml).toMatch(/submission-type="fdast1"/); // Original Application
  }, 60_000);

  it('a follow-up sequence does not guess that it is an original', async () => {
    /* Sequence 0000 is an original by definition. Sequence 0001 could be an
       efficacy supplement, an annual report, a CMC supplement — the packager
       has not been told, and "Original Application" is not a safe guess. */
    await expect(pack({ submissionType: 'ind', sequence: '0001' })).rejects.toThrow(
      /submission-type/i,
    );
  }, 60_000);
});
