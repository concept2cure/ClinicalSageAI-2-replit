/**
 * D18 (2026-10-30, docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e): a §14.3.3
 * the narrative job landed is filed as its own leaf under 5.3.5.1, one
 * narrative at a time with a bookmark and a named destination per subject,
 * linked from §12.3.2 and from the body's §14.3.3 entry; each narrative in the
 * leaf is held to its stored text (SHA-256) and the leaf to the landed section.
 * Narratives that have not landed are a listed gap that blocks placement unless
 * declared not applicable with a reason; an empty leaf is never filed.
 *
 * Red first: before the fix, an assembly of a job with landed narratives had no
 * §14.3.3 leaf, and §12.3.2's "Section 14.3.3" was an unresolved reference.
 * SYNTHETIC data throughout (support/csr-narratives-fixture.ts).
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleCsr } from '../csr-assembly';
import { readPdfStructure } from '../csr-pdf-structure';
import { assemblyInput, SECTIONS } from './support/csr-assembly-fixture';
import { landLmn201Narratives, landManyNarratives } from './support/csr-narratives-fixture';

const NARRATIVES_FILE = 'csr-14-3-3-narratives.pdf';
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

let work: string;
let out: string;
beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-assembly-narratives-'));
  out = path.join(work, 'out');
  await fs.mkdir(out);
});
afterEach(async () => { await fs.rm(work, { recursive: true, force: true }); });

describe('a landed §14.3.3 is filed as its own leaf', () => {
  it('files the narratives under 5.3.5.1, and §12.3.2’s “Section 14.3.3” resolves to that leaf', async () => {
    const landed = await landLmn201Narratives();
    const result = await assembleCsr(await assemblyInput(out, { sections: [...SECTIONS, ...landed.sections], narratives: landed.store }));
    expect(result.unresolvedReferences).toEqual([]);
    const leaf = result.leaves.find(l => l.appendix === '14.3.3');
    expect(leaf).toMatchObject({ fileName: NARRATIVES_FILE, stfFileTag: 'study-report-body', ctdSection: '5.3.5.1', origin: 'generated', studyId: 'SYN-LMN201-B' });
    expect(result.status).toBe('complete');
    expect(result.structure.ok).toBe(true);
    expect(result.crossReferences.map(x => x.target)).toContain(NARRATIVES_FILE);
    expect(result.missing.some(m => m.number === '14.3.3')).toBe(false);
  }, 60_000);

  it('bookmarks and names a destination for every subject, and holds each narrative to its stored text', async () => {
    const landed = await landLmn201Narratives();
    const result = await assembleCsr(await assemblyInput(out, { sections: [...SECTIONS, ...landed.sections], narratives: landed.store }));
    const rows = [...landed.store.rows.values()].sort((a, b) => a.sequence - b.sequence);
    expect(result.narratives).toMatchObject({ verified: true, subjects: rows.length, findings: [], sectionSha256: sha256(landed.sections[1].content) });
    expect(result.narratives!.receipt.map(r => [r.subjectId, r.storedSha256, r.drawnSha256])).toEqual(rows.map(r => [r.subjectId, r.contentHash, sha256(r.content!)]));
    const leaf = await readPdfStructure(await fs.readFile(result.leaves.find(l => l.appendix === '14.3.3')!.sourcePath));
    expect(leaf.destinations).toContain('H14.3.3');
    for (const r of rows) {
      expect(leaf.destinations).toContain(`N-${r.subjectId}`);
      expect(leaf.outline.some(o => o.title.startsWith(`Subject ${r.subjectId} `))).toBe(true);
    }
    // The body's §14.3.3 entry links to each subject's narrative; every link resolved (structure ok above).
    const body = await readPdfStructure(await fs.readFile(result.leaves.find(l => l.appendix === 'body')!.sourcePath));
    const toLeaf = body.links.filter(l => l.file === NARRATIVES_FILE).map(l => l.destination);
    expect(toLeaf).toEqual(expect.arrayContaining(['H14.3.3', ...rows.map(r => `N-${r.subjectId}`)]));
    expect(body.outline.some(o => o.depth === 3 && o.title.startsWith('14.3.3 '))).toBe(true);
  }, 60_000);
});

describe('fails closed: a §14.3.3 that cannot be verified is a blocking gap, never a leaf', () => {
  it('a stored narrative changed after §14.3.3 landed', async () => {
    const landed = await landLmn201Narratives();
    const row = [...landed.store.rows.values()][0];
    row.content = `${row.content} Edited after landing.`;
    row.contentHash = sha256(row.content);
    const result = await assembleCsr(await assemblyInput(out, { sections: [...SECTIONS, ...landed.sections], narratives: landed.store }));
    expect(result.leaves.some(l => l.appendix === '14.3.3')).toBe(false);
    expect(result.missing.find(m => m.number === '14.3.3')).toMatchObject({ blocking: true, reason: expect.stringMatching(/does not match the stored narratives/) });
    expect(result.status).toBe('incomplete');
    await expect(fs.access(path.join(out, NARRATIVES_FILE))).rejects.toThrow();
  }, 60_000);

  it('a stored narrative whose text no longer matches its recorded SHA-256', async () => {
    const landed = await landLmn201Narratives();
    const row = [...landed.store.rows.values()][1];
    row.contentHash = '0'.repeat(64);
    const result = await assembleCsr(await assemblyInput(out, { sections: [...SECTIONS, ...landed.sections], narratives: landed.store }));
    expect(result.leaves.some(l => l.appendix === '14.3.3')).toBe(false);
    expect(result.missing.find(m => m.number === '14.3.3')?.reason).toMatch(new RegExp(`subject ${row.subjectId}.*recorded SHA-256`));
    expect(result.narratives).toMatchObject({ verified: false });
  }, 60_000);

  it('a landed §14.3.3 with no stored narratives to check it against', async () => {
    const landed = await landLmn201Narratives();
    const result = await assembleCsr(await assemblyInput(out, { sections: [...SECTIONS, ...landed.sections], narratives: undefined }));
    expect(result.leaves.some(l => l.appendix === '14.3.3')).toBe(false);
    expect(result.missing.find(m => m.number === '14.3.3')).toMatchObject({ blocking: true });
  }, 60_000);

  it('narratives not landed: a listed blocking gap that names the narrative job’s state, and no leaf', async () => {
    const result = await assembleCsr(await assemblyInput(out, { narratives: { page: async () => [], notLandedReason: 'The narrative job composed 6 and refused 89.' } }));
    expect(result.leaves.some(l => l.appendix === '14.3.3')).toBe(false);
    expect(result.missing.find(m => m.number === '14.3.3')).toMatchObject({ blocking: true, title: expect.stringMatching(/^Narratives of Deaths/),
      reason: expect.stringMatching(/The narrative job composed 6 and refused 89\./) });
    expect(result.status).toBe('incomplete');
  }, 60_000);

  it('declared not applicable with a reason: listed, no leaf, not blocking; a short reason or a declaration beside landed narratives is refused', async () => {
    const reason = 'SYNTHETIC: no subject died, had a serious adverse event or withdrew for one.';
    const result = await assembleCsr(await assemblyInput(out, { notApplicable: { '16.2.6': 'SYNTHETIC test: no subject-level efficacy data', '14.3.3': reason } }));
    expect(result.notApplicable).toContainEqual({ number: '14.3.3', reason });
    expect(result.missing.some(m => m.number === '14.3.3')).toBe(false);
    expect(result.leaves.some(l => l.appendix === '14.3.3')).toBe(false);
    await expect(assembleCsr(await assemblyInput(out, { notApplicable: { '14.3.3': 'n/a' } }))).rejects.toMatchObject({ code: 'CSR_ASSEMBLY_REASON_REQUIRED' });
    const landed = await landLmn201Narratives();
    await expect(assembleCsr(await assemblyInput(out, { sections: [...SECTIONS, ...landed.sections], narratives: landed.store, notApplicable: { '14.3.3': reason } })))
      .rejects.toMatchObject({ code: 'CSR_ASSEMBLY_APPENDIX_AMBIGUOUS' });
  }, 60_000);

  it('a declaration is refused while the narrative job has saved narratives that have not landed: subjects were selected, so §14.3.3 applies', async () => {
    const reason = 'SYNTHETIC: no subject died, had a serious adverse event or withdrew for one.';
    const narratives = { page: async () => [], notLandedReason: 'The narrative job composed 6 and refused 1.', savedNarratives: 7 };
    await expect(assembleCsr(await assemblyInput(out, { narratives, notApplicable: { '14.3.3': reason } })))
      .rejects.toMatchObject({ code: 'CSR_ASSEMBLY_APPENDIX_AMBIGUOUS', message: expect.stringMatching(/7 narrative/) });
  }, 60_000);
});

describe('streamed one narrative at a time', () => {
  it('reads the stored narratives a page at a time and files hundreds of them, each verified (SYNTHETIC)', async () => {
    const landed = await landManyNarratives(4000);
    const limits: number[] = [];
    const page = landed.store.page.bind(landed.store);
    const narratives = { page: (after: Parameters<typeof page>[0], limit: number) => { limits.push(limit); return page(after, limit); } };
    const result = await assembleCsr(await assemblyInput(out, { sections: [...SECTIONS, ...landed.sections], narratives }));
    expect(result.narratives).toMatchObject({ verified: true, subjects: landed.store.rows.size });
    expect(landed.store.rows.size).toBeGreaterThan(600);
    expect(Math.max(...limits)).toBeLessThanOrEqual(50);
    expect(result.leaves.find(l => l.appendix === '14.3.3')!.pages).toBeGreaterThan(150);
    expect(result.status).toBe('complete');
  }, 180_000);
});
