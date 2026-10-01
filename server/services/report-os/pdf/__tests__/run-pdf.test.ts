/**
 * The run PDF is a faithful, marked copy (reporting review 2026-10-01, Part 11:
 * PART11-5 and PART11-8). Each case extracts the PDF's text and checks what a
 * reader of the exported file would see: the whole body, never cut; "NOT FINAL"
 * on a run that is not; the signature, reason, prior status, seal and
 * verification verdict on a final one; the export identity on every page; and
 * no character or time silently invented or dropped.
 */
import { describe, expect, it } from 'vitest';
import { buildRunPdf, type RunPdfInput } from '../run-pdf';
import type { RenderedReport } from '../../render/types';
import type { RunSealView } from '../../sealing/run-seal';

type PdfParseCtor = new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> };

async function textOf(bytes: Buffer): Promise<string> {
  // pdf-parse ships CommonJS typings; read it the way services/ocr/extractDocumentText.ts does.
  const { PDFParse } = (await import('pdf-parse')) as unknown as { PDFParse: PdfParseCtor };
  const parser = new PDFParse({ data: bytes });
  const result = await parser.getText();
  return result.text.replace(/\s+/g, ' ');
}

const REPORT: RenderedReport = {
  reportTypeId: 'readiness.executive_digest',
  scopeType: 'project',
  scopeId: '12',
  generatedAt: '2026-10-01T08:00:00.000Z',
  status: 'partial',
  sections: [
    { id: 'executive-summary', title: 'Executive summary', blocks: [{ kind: 'summary', text: 'Readiness holds at partial.' }, { kind: 'metric', label: 'Confidence', value: 64, unit: '%' }] },
    { id: 'provider-readiness', title: 'Provider readiness', blocks: [{ kind: 'table', columns: ['Provider', 'Status', 'Note'], rows: [['lifecycle', 'ready', '—']] }] },
    { id: 'blockers', title: 'Blockers', blocks: [{ kind: 'blocker-list', items: ['Module 3 stability data missing'] }] },
    { id: 'gaps', title: 'Gaps', blocks: [{ kind: 'gap-list', items: [{ title: 'Pediatric plan', severity: 'high' }] }] },
  ],
};

const base = (over: Partial<RunPdfInput> = {}): RunPdfInput => ({
  run: { id: 41, runUuid: 'run-uuid-41', reportTypeId: REPORT.reportTypeId, scopeType: 'project', scopeId: '12', status: 'partial', confidence: 64, createdAt: new Date('2026-10-01T08:00:00.000Z') },
  typeLabel: 'Executive Readiness Digest',
  report: REPORT,
  seal: null,
  runBy: 'Sam Lee',
  exportId: 'exp-123',
  exportedAt: '2026-10-01T10:00:00.000Z',
  ...over,
});

const SEAL: RunSealView = {
  runId: 41,
  sealed: true,
  seal: { algorithm: 'sha256', contentHash: 'a'.repeat(64), atomCount: 0, sealedAt: '2026-10-01T09:00:00.000Z' },
  finalizedAt: '2026-10-01T09:00:01.000Z',
  signature: { signerName: 'Dana Reyes', signedAt: '2026-10-01T09:00:01.000Z', meaning: 'approval' },
  finalization: { reason: 'Issued for the board pack', meaning: 'approval', priorStatus: 'completed' },
  verification: { verdict: 'intact', checks: [{ check: 'audit-chain', ok: true, detail: 'ok' }] },
};

describe('buildRunPdf', () => {
  it('prints every section and block of the report, with the run facts and who ran it', async () => {
    const t = await textOf((await buildRunPdf(base())).bytes);
    for (const expected of ['Executive Readiness Digest', 'Run #41 (run-uuid-41)', 'Scope: project 12', 'Status: partial', 'Computed: 2026-10-01T08:00:00.000Z (UTC)', 'Run by: Sam Lee', 'Readiness holds at partial.', 'Confidence: 64 %', 'Provider | Status | Note', 'lifecycle | ready', '- Module 3 stability data missing', '- Pediatric plan (high)']) {
      expect(t).toContain(expected);
    }
  });

  it('marks a run that is not final on every page, and states the export on every page', async () => {
    const long: RenderedReport = { ...REPORT, sections: [...REPORT.sections, { id: 'b2', title: 'More blockers', blocks: [{ kind: 'blocker-list', items: Array.from({ length: 140 }, (_, i) => `Blocker ${i + 1}`) }] }] };
    const { bytes, pages } = await buildRunPdf(base({ report: long }));
    const t = await textOf(bytes);
    expect(pages).toBeGreaterThan(1);
    expect(t.match(/NOT FINAL \(PARTIAL\)/g)?.length).toBe(pages);
    for (let p = 1; p <= pages; p += 1) expect(t).toContain(`Page ${p} of ${pages}`);
    expect(t.match(/Export exp-123 · Exported 2026-10-01T10:00:00\.000Z \(UTC\)/g)?.length).toBe(pages);
  });

  it('cuts nothing: a long body runs onto further pages, every line present, a long word broken not lost', async () => {
    const word = 'X'.repeat(400);
    const long: RenderedReport = {
      ...REPORT,
      sections: [{ id: 'b', title: 'Blockers', blocks: [{ kind: 'blocker-list', items: Array.from({ length: 300 }, (_, i) => `Blocker ${i + 1}`) }, { kind: 'summary', text: word }] }],
    };
    const t = await textOf((await buildRunPdf(base({ report: long }))).bytes);
    for (const n of [1, 150, 299, 300]) expect(t).toContain(`- Blocker ${n} `);
    expect(t.replace(/[^X]/g, '').length).toBeGreaterThanOrEqual(400);
  });

  it('prints the signature, reason, prior status, seal and verdict of a final run, and no NOT FINAL mark', async () => {
    const t = await textOf((await buildRunPdf(base({ run: { ...base().run, status: 'final' }, seal: SEAL }))).bytes);
    expect(t).toContain('Final. Signed by Dana Reyes as approval, 2026-10-01T09:00:01.000Z (UTC).');
    expect(t).toContain('Reason: Issued for the board pack');
    expect(t).toContain('Status before finalizing: completed');
    expect(t).toContain(`Seal: sha256 ${'a'.repeat(64)}, sealed 2026-10-01T09:00:00.000Z`);
    expect(t).toContain('Seal verification at export: intact.');
    expect(t).not.toMatch(/NOT FINAL/);
  });

  it('says so when the seal does not verify, with the failing check', async () => {
    const mismatch: RunSealView = { ...SEAL, verification: { verdict: 'mismatch', checks: [{ check: 'stored-document', ok: false, detail: 'The stored document no longer hashes to the recorded seal.' }] } };
    const t = await textOf((await buildRunPdf(base({ run: { ...base().run, status: 'final' }, seal: mismatch }))).bytes);
    expect(t).toContain('Seal verification at export: mismatch.');
    expect(t).toContain('- The stored document no longer hashes to the recorded seal.');
  });

  it('keeps Latin-1 characters, prints the rest as "?" and says how many', async () => {
    const report: RenderedReport = { ...REPORT, sections: [{ id: 's', title: 'Dose', blocks: [{ kind: 'summary', text: 'Résumé: 5 µg at 4 °C; dose ≥ 10 mg ✓' }] }] };
    const { bytes, replacedCharacters } = await buildRunPdf(base({ report }));
    const t = await textOf(bytes);
    expect(t).toMatch(/Résumé: 5 [µμ]g at 4 °C; dose \? 10 mg \?/);
    expect(replacedCharacters).toBe(2);
    expect(t).toContain('2 character(s) outside the PDF font\'s character set are shown as "?".');
  });

  it('prints a missing time as not recorded, never the moment of export', async () => {
    const t = await textOf((await buildRunPdf(base({ run: { ...base().run, createdAt: null }, runBy: null }))).bytes);
    expect(t).toContain('Computed: not recorded');
    expect(t).toContain('Run by: not recorded');
  });

  it('prints a disclosure in full and names a chart it does not draw', async () => {
    const report: RenderedReport = {
      ...REPORT,
      sections: [{ id: 'm', title: 'Method', blocks: [
        { kind: 'disclosure', method: 'Rules-based readiness model', validated: false, note: 'Advisory only.' },
        { kind: 'chart', chartType: 'readiness_ring', spec: {} } as never,
      ] }],
    };
    const t = await textOf((await buildRunPdf(base({ report }))).bytes);
    expect(t).toContain('Disclosure: Rules-based readiness model; not validated. Advisory only.');
    expect(t).toContain('[Chart: readiness_ring. Charts are not reproduced in the PDF; the canvas shows it.]');
  });
});
