/**
 * CSR slice 8 (2026-10-29): the §16.2 listings stream. A SYNTHETIC set
 * (support/csr-scale-synthetic.ts, every value invented) is assembled and the
 * process's memory is sampled while the leaves are written and checked: the
 * heap must stay under a fixed ceiling whatever the page count, and every
 * listing must still verify against its source. (The source itself is the
 * input and is in memory; the per-row check holds the source's expected rows,
 * so its memory grows with the rows, not with the pages.)
 *
 * Default: 400 subjects (about 1,400 listing pages), so the suite stays quick.
 * CSR_ASSEMBLY_SCALE_SUBJECTS=3000 runs the evidence size (several thousand
 * pages); CSR_ASSEMBLY_SCALE_REPORT=<file> writes the measurements as JSON.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleCsr } from '../csr-assembly';
import { buildCSRTables } from '../../csr-tabulation-builders';
import { scaleAdlb, scaleEnvelope, SCALE_LABEL } from './support/csr-scale-synthetic';
import { minimalPdf, SECTIONS } from './support/csr-assembly-fixture';

const SUBJECTS = Number(process.env.CSR_ASSEMBLY_SCALE_SUBJECTS ?? 400);

describe('the CSR listings are generated streaming, at several thousand pages', () => {
  it(`assembles ${SUBJECTS} synthetic subjects with the heap under a fixed ceiling`, async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-scale-'));
    try {
      const envelope = scaleEnvelope(SUBJECTS);
      const laboratory = scaleAdlb(envelope);
      const out = path.join(work, 'out');
      await fs.mkdir(out);
      const supplied: Record<string, { path: string; sha256: string }> = {};
      for (const n of ['16.1.1', '16.1.2', '16.1.3', '16.1.4', '16.1.5', '16.1.7', '16.1.9', '16.3']) supplied[n] = await minimalPdf(path.join(work, `${n}.pdf`), n);
      global.gc?.();
      const start = process.memoryUsage();
      let peakHeap = start.heapUsed, peakRss = start.rss;
      const sampler = setInterval(() => {
        const m = process.memoryUsage();
        peakHeap = Math.max(peakHeap, m.heapUsed);
        peakRss = Math.max(peakRss, m.rss);
      }, 25);
      const t0 = performance.now();
      const result = await assembleCsr({ studyId: 'SYN-SCALE', title: SCALE_LABEL, sections: SECTIONS.filter(s => s.code !== '1'), tables: buildCSRTables(envelope.studyData),
        listingSource: { study: envelope.studyData, participants: envelope.participants, laboratory, protocolDeviations: [] },
        supplied, notApplicable: { '16.2.6': 'SYNTHETIC scale test: no subject-level efficacy data' }, outDir: out, contentModifiedAt: new Date('2026-06-30T00:00:00Z') });
      const seconds = (performance.now() - t0) / 1000;
      clearInterval(sampler);
      const listingPages = result.listings.reduce((n, l) => n + l.pages, 0);
      const bytesWritten = result.leaves.filter(l => l.origin === 'generated').reduce((n, l) => n + l.bytes, 0);
      const report = {
        synthetic: SCALE_LABEL, subjects: SUBJECTS, adverseEvents: envelope.studyData.adverseEvents.length, labRecords: laboratory.rows.length,
        listings: result.listings.map(l => ({ number: l.number, rows: l.rows, pages: l.pages, verified: l.verification.ok })),
        listingPages, totalPages: result.leaves.reduce((n, l) => n + (l.pages ?? 0), 0), bytesWritten, seconds: Math.round(seconds * 10) / 10,
        heapBeforeMiB: Math.round(start.heapUsed / 2 ** 20), peakHeapMiB: Math.round(peakHeap / 2 ** 20), peakHeapGrowthMiB: Math.round((peakHeap - start.heapUsed) / 2 ** 20),
        rssBeforeMiB: Math.round(start.rss / 2 ** 20), peakRssMiB: Math.round(peakRss / 2 ** 20), status: result.status, structureOk: result.structure.ok,
      };
      if (process.env.CSR_ASSEMBLY_SCALE_REPORT) await fs.writeFile(process.env.CSR_ASSEMBLY_SCALE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
      expect(result.status).toBe('complete');
      expect(result.listings.every(l => l.verification.ok)).toBe(true);
      expect(listingPages).toBeGreaterThan(SUBJECTS * 3);
      // The document is never held: heap growth stays under a fixed ceiling at any page count
      // (3,000 subjects, 9,228 pages: 163 MiB, most of it the row check's expected rows).
      expect(peakHeap - start.heapUsed).toBeLessThan(400 * 2 ** 20);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 1_800_000);
});
