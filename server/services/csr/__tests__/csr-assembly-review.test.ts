/**
 * CSR slice 8 adversarial review (2026-10-29). SYNTHETIC data throughout
 * (support/csr-assembly-fixture.ts). Each case was seen failing before its fix
 * (docs/evidence/D2-CSR/2026-10-29-slice8-assembly-export/red-review.txt):
 *
 * - an ADLB without ABLFL listed every record as "Baseline: No";
 * - an XPT ADLB's ADT (a SAS day count) was listed as a bare number under "Date";
 * - a value the listing's fonts cannot draw printed as '?' while the receipt
 *   recorded the source value, so the row check passed;
 * - a run with no engine table said "the tables of Section 14 are filed as …"
 *   with no such leaf, and the assembly was complete;
 * - the structural check loaded every linked leaf whole (a 7,449-page listing:
 *   ~37 MiB of heap) to learn its page count and named destinations.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleCsr } from '../csr-assembly';
import { checkCsrAssemblyStructure, readLeafTargets, readPdfStructure } from '../csr-pdf-structure';
import { CsrPdfWriter } from '../csr-pdf-writer';
import { planListings } from '../csr-listings';
import type { AdamDataset } from '../adam-dataset-reader';
import { assemblyInput } from './support/csr-assembly-fixture';

let work: string;
let out: string;
beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-assembly-review-'));
  out = path.join(work, 'out');
  await fs.mkdir(out);
});
afterEach(async () => { await fs.rm(work, { recursive: true, force: true }); });

const SAS_DAY_2024_03_01 = 23436; // days from 1960-01-01

async function receiptRows(receiptPath: string): Promise<string[][]> {
  return (await fs.readFile(receiptPath, 'utf8')).trim().split('\n').map(l => (JSON.parse(l) as { cells: string[] }).cells);
}

describe('the laboratory listing shows only what ADLB records', () => {
  it('reads Baseline as not recorded when ADLB has no ABLFL, and an XPT date as a date', async () => {
    const input = await assemblyInput(out);
    const adlb = input.listingSource.laboratory!;
    const subjectId = String(adlb.rows[0].USUBJID);
    const laboratory: AdamDataset = {
      name: 'ADLB', format: 'xpt', columns: adlb.columns.filter(c => c !== 'ABLFL'),
      rows: adlb.rows.map((row, i) => {
        const rest = { ...row };
        delete rest.ABLFL;
        return i === 0 ? { ...rest, ADT: SAS_DAY_2024_03_01 } : rest;
      }),
    };
    const result = await assembleCsr({ ...input, listingSource: { ...input.listingSource, laboratory } });
    const lab = result.listings.find(l => l.number === '16.2.8')!;
    expect(lab.verification.ok).toBe(true);
    const rows = await receiptRows(lab.receiptPath);
    expect(rows.every(cells => cells[5] === 'not recorded')).toBe(true);
    expect(rows.some(cells => cells[1] === subjectId && cells[3] === '2024-03-01')).toBe(true);
    expect(rows.some(cells => cells[3] === String(SAS_DAY_2024_03_01))).toBe(false);
  }, 60_000);
});

describe('a listing value the PDF fonts cannot draw fails the source check', () => {
  it('records the row as drawn, so a "?" in place of a character is a disagreement, and a lossless substitution is not', async () => {
    const input = await assemblyInput(out);
    const study = JSON.parse(JSON.stringify(input.listingSource.study)) as typeof input.listingSource.study;
    study.demographics[2] = { ...study.demographics[2], race: '漢族' };
    study.demographics[3] = { ...study.demographics[3], ethnicity: 'Not Hispanic or Latino ₂' };
    const result = await assembleCsr({ ...input, listingSource: { ...input.listingSource, study } });
    const demo = result.listings.find(l => l.number === '16.2.4')!;
    expect(demo.verification.ok).toBe(false);
    expect(demo.verification.findings).toContain(`Listing 16.2.4: a row for subject ${study.demographics[2].subjectId} disagrees with the source in Race.`);
    expect(demo.verification.findings.some(f => f.includes(study.demographics[3].subjectId))).toBe(false);
    expect(result.status).toBe('incomplete');
  }, 60_000);
});

describe('a run with no engine table does not claim a Section 14 document', () => {
  it('says Section 14 is not supplied, files no tables leaf, and is incomplete', async () => {
    const input = await assemblyInput(out, { tables: {} });
    const result = await assembleCsr(input);
    expect(result.leaves.some(l => l.appendix === '14')).toBe(false);
    expect(result.bodyGaps).toContain('Section 14: the retained run holds no engine table; no Section 14 document is filed.');
    expect(result.status).toBe('incomplete');
  }, 60_000);
});

describe('the structural check reads a linked leaf without loading it', () => {
  it('reads page count and named destinations from the cross-reference table, as a whole read does', async () => {
    const env = (await assemblyInput(out)).listingSource;
    const def = planListings(env).generated.find(d => d.number === '16.2.8')!;
    const file = path.join(out, 'lab.pdf');
    const w = new CsrPdfWriter({ path: file, title: 'lab', runningHeader: 'lab', stamp: new Date(0), landscape: true });
    w.heading('Listing 16.2.8', 1, 'L16.2.8');
    await w.table({ headers: def.headers, widths: def.widths }, (function* () { for (const r of def.rows()) yield { cells: r.cells }; })());
    w.destination('Lend');
    await w.finish();
    const whole = await readPdfStructure(await fs.readFile(file));
    const bounded = await readLeafTargets(file);
    expect(bounded).not.toBeNull();
    expect(bounded!.pages).toBe(whole.pages);
    expect([...bounded!.destinations].sort()).toEqual([...whole.destinations].sort());
  }, 60_000);

  it('falls back to a whole read for a leaf laid out otherwise (an xref stream), and still fails a destination it lacks', async () => {
    const doc = await PDFDocument.create();
    doc.addPage(); doc.addPage();
    const target = path.join(out, 'supplied.pdf');
    await fs.writeFile(target, await doc.save({ useObjectStreams: true }));
    expect(await readLeafTargets(target)).toBeNull();
    const body = path.join(out, 'body.pdf');
    const w = new CsrPdfWriter({ path: body, title: 'b', runningHeader: 'b', stamp: new Date(0) });
    w.heading('1 Title', 1, 'H1');
    w.paragraph([{ text: 'Page one', link: { kind: 'external', fileName: 'supplied.pdf', destination: null } }]);
    w.paragraph([{ text: 'Missing', link: { kind: 'external', fileName: 'supplied.pdf', destination: 'Lnone' } }]);
    await w.finish();
    const report = await checkCsrAssemblyStructure({ body: { fileName: 'body.pdf', path: body, headings: [] }, leaves: [{ fileName: 'supplied.pdf', path: target }], minimumDepth: 1 });
    expect(report.linksChecked).toBe(2);
    expect(report.findings.map(f => f.message)).toEqual([expect.stringContaining('supplied.pdf#Lnone')]);
  }, 60_000);
});
