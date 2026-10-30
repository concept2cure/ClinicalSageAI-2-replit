/**
 * CSR slice 8 (2026-10-29): an imported CSR assembles into the body, the §14
 * tables, the §16.2 listings and the supplied §16.1/§16.3 documents as separate
 * Module 5.3.5.1 leaves, each with its Study Tagging File role, and is handed
 * to the regional packager unchanged. SYNTHETIC data throughout
 * (support/csr-assembly-fixture.ts).
 *
 * Red-first cases: a body with a broken §14 hyperlink, a body whose bookmarks
 * stop short of four levels, and a listing that disagrees with its source
 * subject must each fail.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleCsr, CsrAssemblyError } from '../csr-assembly';
import { checkCsrAssemblyStructure, readPdfStructure } from '../csr-pdf-structure';
import { verifyListingReceipt } from '../csr-listing-verify';
import { CsrPdfWriter } from '../csr-pdf-writer';
import { CSR_TABLES_FILE } from '../csr-assembly-plan';
import { packageEctdSubmission } from '../../submission-gateways/regional-packager';
import { assemblyInput, minimalPdf, SECTIONS } from './support/csr-assembly-fixture';
import { landLmn201Narratives } from './support/csr-narratives-fixture';

/** The fixture with the study's own narratives landed by the narrative job (§12.3.2 and §14.3.3), as a complete build has them. */
async function withNarratives(dir: string) {
  const landed = await landLmn201Narratives();
  return assemblyInput(dir, { sections: [...SECTIONS, ...landed.sections], narratives: landed.store });
}

let work: string;
let out: string;
beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-assembly-'));
  out = path.join(work, 'out');
  await fs.mkdir(out);
});
afterEach(async () => { await fs.rm(work, { recursive: true, force: true }); });

describe('an imported CSR assembles into separate 5.3.5.1 leaves with their STF roles', () => {
  it('builds the body, §14, §14.3.3 and §16 leaves; bookmarks reach four levels and every link resolves', async () => {
    const result = await assembleCsr(await withNarratives(out));
    expect(result.status).toBe('complete');
    expect(result.structure).toMatchObject({ ok: true, bodyOutlineDepth: 4 });
    expect(result.structure.linksChecked).toBeGreaterThan(40);
    expect(result.unresolvedReferences).toEqual([]);
    const byAppendix = new Map(result.leaves.map(l => [l.appendix, l]));
    expect(byAppendix.get('body')).toMatchObject({ fileName: 'csr-body.pdf', stfFileTag: 'study-report-body', ctdSection: '5.3.5.1', studyId: 'SYN-LMN201-B', operation: 'new' });
    expect(byAppendix.get('14')).toMatchObject({ fileName: CSR_TABLES_FILE, stfFileTag: 'study-report-body' });
    expect(byAppendix.get('14.3.3')).toMatchObject({ fileName: 'csr-14-3-3-narratives.pdf', stfFileTag: 'study-report-body', origin: 'generated' });
    expect(byAppendix.get('16.1.1')).toMatchObject({ stfFileTag: 'protocol-or-amendment', origin: 'supplied' });
    expect(byAppendix.get('16.1.5')).toMatchObject({ stfFileTag: 'signatures-investigators', origin: 'supplied' });
    expect(byAppendix.get('16.2.7')).toMatchObject({ stfFileTag: 'adverse-event-listings', origin: 'generated' });
    expect(byAppendix.get('16.2.8')).toMatchObject({ stfFileTag: 'listing-individual-laboratory-measurements-by-patient' });
    expect(result.stfWarnings).toEqual([]);
    expect(result.listings.every(l => l.verification.ok)).toBe(true);
    expect(result.listings.find(l => l.number === '16.2.4')?.rows).toBe(23);
    // Only when-applicable documents remain unsupplied, and none blocks.
    expect(result.missing.map(m => m.number)).toEqual(['16.1.6', '16.1.8', '16.1.10', '16.1.11', '16.1.12', '16.2.5']);
    expect(result.missing.every(m => !m.blocking)).toBe(true);
    // §4 comes from build_abbreviation_list's composer; an undefined one is said to be undefined.
    expect(result.abbreviations.undefinedAtFirstUse).toContain('MedDRA');
  }, 60_000);

  it('numbers the engine tables 14.1.x / 14.2.x / 14.3.x and bookmarks them to four levels in the §14 leaf', async () => {
    const result = await assembleCsr(await assemblyInput(out));
    const tables = await readPdfStructure(await fs.readFile(path.join(out, CSR_TABLES_FILE)));
    for (const dest of ['T14.1.1', 'T14.1.3', 'T14.2.1', 'T14.3.1.1', 'T14.3.1.2', 'T14.3.2.1', 'T14.3.5.2', 'H14.3.1']) expect(tables.destinations).toContain(dest);
    expect(tables.outline.find(o => o.title.startsWith('Table 14.3.1.1 '))?.depth).toBe(4);
    expect(result.leaves.find(l => l.appendix === '14')?.pages).toBeGreaterThan(1);
  }, 60_000);

  it('renders identically twice (the leaf digests a later sequence compares)', async () => {
    const first = await assembleCsr(await assemblyInput(out));
    const again = path.join(work, 'again');
    await fs.mkdir(again);
    const second = await assembleCsr(await assemblyInput(again));
    const digests = (r: typeof first) => r.leaves.filter(l => l.origin === 'generated').map(l => [l.fileName, l.sha256]);
    expect(digests(second)).toEqual(digests(first));
  }, 60_000);
});

describe('documents only the sponsor can supply are never composed', () => {
  it('lists the protocol, sample CRF, investigators, signatures and SAP as blocking gaps when they are not supplied', async () => {
    const result = await assembleCsr(await assemblyInput(out, { supplied: {} }));
    expect(result.status).toBe('incomplete');
    const blocking = result.missing.filter(m => m.blocking).map(m => m.number);
    expect(blocking).toEqual(expect.arrayContaining(['16.1.1', '16.1.2', '16.1.4', '16.1.5', '16.1.7', '16.1.9', '16.3']));
    expect(result.leaves.some(l => l.appendix.startsWith('16.1') || l.appendix === '16.3')).toBe(false);
    // "Appendix 16.1.1" in the text links to the body's own §16.1.1 entry, which says it was not supplied.
    expect(result.structure.ok).toBe(true);
    expect(result.unresolvedReferences).toEqual([]);
    const missing = result.missing.find(m => m.number === '16.1.1')!;
    expect(missing.reason).toMatch(/Only the sponsor can supply this document/);
  }, 60_000);

  it('refuses a supplied document whose bytes are not the version named, or that is not a PDF', async () => {
    const input = await assemblyInput(out);
    input.supplied!['16.1.1'] = { ...input.supplied!['16.1.1']!, sha256: '0'.repeat(64) };
    await expect(assembleCsr(input)).rejects.toMatchObject({ code: 'CSR_ASSEMBLY_SUPPLIED_DIGEST' });
    const text = path.join(work, 'protocol.txt');
    await fs.writeFile(text, 'not a pdf');
    const input2 = await assemblyInput(out);
    input2.supplied!['16.1.1'] = { path: text, sha256: '0'.repeat(64) };
    await expect(assembleCsr(input2)).rejects.toBeInstanceOf(CsrAssemblyError);
  }, 60_000);

  it('refuses a supplied copy of a listing the source generates, and a not-applicable claim without a reason', async () => {
    const extra = await minimalPdf(path.join(work, 'ae.pdf'), 'AE listing');
    await expect(assembleCsr(await assemblyInput(out, { supplied: { '16.2.7': extra } }))).rejects.toMatchObject({ code: 'CSR_ASSEMBLY_APPENDIX_AMBIGUOUS' });
    await expect(assembleCsr(await assemblyInput(out, { notApplicable: { '16.1.8': 'n/a' } }))).rejects.toMatchObject({ code: 'CSR_ASSEMBLY_REASON_REQUIRED' });
  }, 60_000);
});

describe('red first: the structural check fails a broken §14 hyperlink and bookmarks shallower than four levels', () => {
  async function body(file: string, write: (w: CsrPdfWriter) => void) {
    const writer = new CsrPdfWriter({ path: file, title: 'Body', runningHeader: 'Body', stamp: new Date(0) });
    write(writer);
    await writer.finish();
  }
  const fourLevels = (w: CsrPdfWriter) => {
    w.heading('11 Efficacy Evaluation', 1, 'H11');
    w.heading('11.4 Efficacy Results', 2, 'H11.4');
    w.heading('11.4.2 Statistical/Analytical Issues', 3, 'H11.4.2');
    w.heading('11.4.2.1 Adjustments for Covariates', 4, 'H11.4.2.1');
  };
  const headings = [{ number: '11', title: 'x' }, { number: '11.4', title: 'x' }, { number: '11.4.2', title: 'x' }, { number: '11.4.2.1', title: 'x' }];

  it('fails a link to a §14 table the tables leaf does not define, a file outside the assembly and an undefined internal destination', async () => {
    const result = await assembleCsr(await assemblyInput(out));
    const tables = result.leaves.find(l => l.appendix === '14')!;
    const file = path.join(work, 'broken-body.pdf');
    await body(file, w => {
      fourLevels(w);
      w.paragraph([{ text: 'See ' }, { text: 'Table 14.9.9', link: { kind: 'external', fileName: CSR_TABLES_FILE, destination: 'T14.9.9' } }, { text: ' and ' },
        { text: 'Table 14.1.1', link: { kind: 'external', fileName: CSR_TABLES_FILE, destination: 'T14.1.1' } }, { text: ' and ' },
        { text: 'Listing 16.2.99', link: { kind: 'external', fileName: 'csr-16-2-99.pdf', destination: 'L16.2.99' } }, { text: ' and ' },
        { text: 'Section 9.9', link: { kind: 'internal', destination: 'H9.9' } }]);
    });
    const report = await checkCsrAssemblyStructure({ body: { fileName: 'csr-body.pdf', path: file, headings }, leaves: [{ fileName: CSR_TABLES_FILE, path: tables.sourcePath }] });
    expect(report.ok).toBe(false);
    expect(report.findings.map(f => f.code)).toEqual(['BROKEN_LINK', 'BROKEN_LINK', 'BROKEN_LINK']);
    expect(report.findings.map(f => f.message).join('\n')).toMatch(/csr-14-tables\.pdf#T14\.9\.9/);
    expect(report.findings.map(f => f.message).join('\n')).toMatch(/csr-16-2-99\.pdf, which is not a file of this assembly/);
    expect(report.findings.map(f => f.message).join('\n')).toMatch(/destination H9\.9/);
    expect(report.linksChecked).toBe(4); // the good link to T14.1.1 resolved
  }, 60_000);

  it('fails bookmarks that stop at three levels, and a heading drawn without its bookmark', async () => {
    const file = path.join(work, 'shallow-body.pdf');
    await body(file, w => {
      w.heading('11 Efficacy Evaluation', 1, 'H11');
      w.heading('11.4 Efficacy Results', 2, 'H11.4');
      w.heading('11.4.2 Statistical/Analytical Issues', 3, 'H11.4.2');
      w.lines('11.4.2.1 Adjustments for Covariates', { font: 'Helvetica-Bold' }); // drawn, not bookmarked
    });
    const report = await checkCsrAssemblyStructure({ body: { fileName: 'csr-body.pdf', path: file, headings }, leaves: [] });
    expect(report.ok).toBe(false);
    expect(report.bodyOutlineDepth).toBe(3);
    expect(report.findings.map(f => f.code)).toEqual(['BOOKMARK_DEPTH', 'BOOKMARK_MISSING']);
  }, 60_000);

  it('marks an assembly incomplete when its drafted body has no fourth-level heading', async () => {
    const shallow = SECTIONS.filter(s => s.code.split('.').length < 4);
    const result = await assembleCsr(await assemblyInput(out, { sections: shallow }));
    expect(result.structure.bodyOutlineDepth).toBe(3);
    expect(result.structure.findings.map(f => f.code)).toEqual(['BOOKMARK_DEPTH']);
    expect(result.status).toBe('incomplete');
  }, 60_000);

  it('reports a body cross-reference that names nothing in the assembly, and does not link it', async () => {
    const sections = [...SECTIONS, { code: '12.5', title: 'Vital Signs', content: 'Vital signs are in Table 14.9.9.' }];
    const result = await assembleCsr(await assemblyInput(out, { sections }));
    expect(result.unresolvedReferences).toEqual([{ reference: 'Table 14.9.9', number: '14.9.9', section: '12.5' }]);
    expect(result.structure.ok).toBe(true);
    expect(result.status).toBe('incomplete');
  }, 60_000);
});

describe('red first: a listing that disagrees with its source subject fails', () => {
  it('names the subject and column when the source records something else, and a source record left unlisted', async () => {
    const input = await assemblyInput(out);
    const result = await assembleCsr(input);
    const demographics = result.listings.find(l => l.number === '16.2.4')!;
    const headers = ['Treatment group', 'Subject', 'Age', 'Sex', 'Race', 'Ethnicity', 'Weight', 'BMI'];
    const changed = JSON.parse(JSON.stringify(input.listingSource)) as typeof input.listingSource;
    changed.study.demographics[4] = { ...changed.study.demographics[4], age: changed.study.demographics[4].age + 1 };
    const verdict = await verifyListingReceipt('16.2.4', demographics.receiptPath, changed, headers);
    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0]).toBe(`Listing 16.2.4: a row for subject ${changed.study.demographics[4].subjectId} disagrees with the source in Age.`);

    const lines = (await fs.readFile(demographics.receiptPath, 'utf8')).trim().split('\n');
    await fs.writeFile(demographics.receiptPath, `${lines.slice(1).join('\n')}\n`);
    const dropped = await verifyListingReceipt('16.2.4', demographics.receiptPath, input.listingSource, headers);
    expect(dropped.ok).toBe(false);
    expect(dropped.findings[0]).toMatch(/1 source record\(s\) of subject .* are not listed/);
  }, 60_000);

  it('holds the adverse-event listing to every source event of the subject, each used once', async () => {
    const input = await assemblyInput(out);
    const result = await assembleCsr(input);
    const ae = result.listings.find(l => l.number === '16.2.7')!;
    expect(ae.verification).toMatchObject({ ok: true, rows: input.listingSource.study.adverseEvents.length });
    const doubled = JSON.parse(JSON.stringify(input.listingSource)) as typeof input.listingSource;
    doubled.study.adverseEvents.push(doubled.study.adverseEvents[0]);
    const verdict = await verifyListingReceipt('16.2.7', ae.receiptPath, doubled, []);
    expect(verdict.ok).toBe(false);
  }, 60_000);
});

describe('hand-off to Submission Center’s packager', () => {
  it('packages the leaves into the study folder with its stf-<study-id>.xml and every cross-reference resolved', async () => {
    const result = await assembleCsr(await withNarratives(out));
    const bundle = await packageEctdSubmission({
      region: 'fda', applicationId: '123456', sequence: '0000', submissionType: 'original', fda: { applicationType: 'ind' },
      sponsorId: 'D', sponsorName: 'SYNTHETIC sponsor', productName: 'SYNTHETIC product', outputDir: path.join(work, 'pkg'),
      environment: 'staging', leaves: result.leaves, crossReferences: result.crossReferences,
      studyMeta: [{ studyId: 'SYN-LMN201-B', studyTitle: 'SYNTHETIC LMN-201-shaped study' }],
    });
    expect(bundle.stf).toEqual({ studies: 1, leaves: result.leaves.length, untagged: 0 });
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const stf = await zip.file('m5/5-3-5-1/syn-lmn201-b/stf-syn-lmn201-b.xml')!.async('string');
    for (const tag of ['study-report-body', 'protocol-or-amendment', 'signatures-investigators', 'adverse-event-listings', 'demographic-data']) {
      expect(stf).toContain(`<file-tag name="${tag}" info-type="ich"/>`);
    }
    expect(stf.match(/<file-tag name="study-report-body" info-type="ich"\/>/g)).toHaveLength(3);
    expect(stf).not.toContain('<file-tag name="study-report"');
    expect(Object.keys(zip.files)).toContain('m5/5-3-5-1/syn-lmn201-b/csr-body.pdf');
    expect(Object.keys(zip.files)).toContain('m5/5-3-5-1/syn-lmn201-b/csr-16-2-7-adverse-events.pdf');
    expect(Object.keys(zip.files)).toContain('m5/5-3-5-1/syn-lmn201-b/csr-14-3-3-narratives.pdf');
  }, 120_000);
});
