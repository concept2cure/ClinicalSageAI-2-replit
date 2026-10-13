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

  it('discloses the actual organization data scope independently of the selected program and retains recorded calculation evidence', async () => {
    const report: RenderedReport = { ...REPORT, scopeLabel: 'Sponsor A — Program 12', computedScope: 'organization', provenance: { organizationId: 7, source: 'controlled_documents', inputs: { final: 2, existing: 5 } } };
    const t = await textOf((await buildRunPdf(base({ report }))).bytes);
    expect(t).toContain('Scope: Sponsor A — Program 12');
    expect(t).toContain('Data scope: organization');
    expect(t).toContain('Recorded calculation evidence');
    expect(t).toContain('"existing": 5');
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

});

describe('buildRunPdf — multilingual fidelity and identity', () => {
  it('preserves recorded symbols and Chinese, Japanese and Korean text with embedded fonts', async () => {
    const report: RenderedReport = { ...REPORT, sections: [{ id: 's', title: 'Dose', blocks: [{ kind: 'summary', text: 'Résumé: 5 µg at 4 °C; dose ≥ 10 mg ✓ 中文报告 日本語 한국어' }] }] };
    const { bytes, replacedCharacters } = await buildRunPdf(base({ report }));
    const t = await textOf(bytes);
    expect(t).toMatch(/Résumé: 5 [µμ]g at 4 °C; dose ≥ 10 mg ✓/);
    expect(t).toContain('中文报告');
    expect(t).toContain('日本語');
    expect(t).toContain('한국어');
    expect(replacedCharacters).toBe(0);
    expect(t).not.toContain('shown as "?"');
  });

  it('refuses an unsupported glyph rather than changing governed content', async () => {
    const report: RenderedReport = { ...REPORT, sections: [{ id: 's', title: 'Dose', blocks: [{ kind: 'summary', text: `Dose ${String.fromCodePoint(0x10ffff)}` }] }] };
    await expect(buildRunPdf(base({ report }))).rejects.toThrow(/U\+10FFFF.*Nothing was exported/);
  });

  it('preserves Arabic, Hebrew and mixed-direction recorded text through font shaping and bidi layout', async () => {
    const report: RenderedReport = { ...REPORT, sections: [{ id: 's', title: 'Multilingual evidence', blocks: [
      { kind: 'summary', text: 'تقرير الامتثال للبرنامج' },
      { kind: 'summary', text: 'דוח תאימות לתוכנית' },
      { kind: 'summary', text: 'Phase 3: تقرير الامتثال — דוח תאימות' },
    ] }] };
    const t = await textOf((await buildRunPdf(base({ report }))).bytes);
    expect(t).toContain('تقرير الامتثال للبرنامج');
    expect(t).toContain('דוח תאימות לתוכנית');
    expect(t).toContain('Phase 3:');
    expect(t).toContain('תאימות');
  });

  it('preserves mirrored bidi punctuation in copied dates without changing Arabic or Hebrew words', async () => {
    const report: RenderedReport = { ...REPORT, sections: [{ id: 's', title: 'Evidence', blocks: [
      { kind: 'summary', text: 'Phase 3: تقرير الامتثال (2026) — דוח תאימות' },
    ] }] };
    const t = await textOf((await buildRunPdf(base({ report }))).bytes);
    expect(t).toContain('(2026)');
    expect(t).toContain('تقرير الامتثال');
    expect(t).toContain('דוח תאימות');
    expect(t).not.toContain(')2026(');
  });

  it('refuses export when embedded fonts are unavailable and keeps recorded metadata deterministic', async () => {
    const before = process.env.REPORT_PDF_NOTO_CORE_DIR;
    try {
      process.env.REPORT_PDF_NOTO_CORE_DIR = '/missing/reporting-fonts';
      await expect(buildRunPdf(base())).rejects.toMatchObject({ status: 503, code: 'REPORT_PDF_FONTS_UNAVAILABLE' });
    } finally {
      if (before === undefined) delete process.env.REPORT_PDF_NOTO_CORE_DIR;
      else process.env.REPORT_PDF_NOTO_CORE_DIR = before;
    }
    const first = await buildRunPdf(base());
    expect((await buildRunPdf(base())).bytes).toEqual(first.bytes);
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.load(first.bytes, { updateMetadata: false });
    expect(pdf.getSubject()).toBe('Export exp-123');
    expect(pdf.getCreationDate()?.toISOString()).toBe(base().exportedAt);
    expect(pdf.getModificationDate()?.toISOString()).toBe(base().exportedAt);
  });

  it('prints a missing time as not recorded, never the moment of export', async () => {
    const t = await textOf((await buildRunPdf(base({ run: { ...base().run, createdAt: null }, runBy: null }))).bytes);
    expect(t).toContain('Computed: not recorded');
    expect(t).toContain('Run by: not recorded');
  });

});

describe('buildRunPdf — recorded chart fidelity', () => {
  it('prints disclosures and the actual series alongside drawn charts', async () => {
    const report: RenderedReport = {
      ...REPORT,
      sections: [{ id: 'm', title: 'Method', blocks: [
        { kind: 'disclosure', method: 'Rules-based readiness model', validated: false, note: 'Advisory only.' },
        { kind: 'chart', chartType: 'readiness_ring', spec: { value: 64, label: 'Program readiness' } },
        { kind: 'chart', chartType: 'bar', spec: { data: [{ label: 'CMC', value: 8 }, { label: 'Clinical', value: 3 }] } },
      ] }],
    };
    const out = await buildRunPdf(base({ report }));
    const t = await textOf(out.bytes);
    expect(t).toContain('Disclosure: Rules-based readiness model; not validated. Advisory only.');
    expect(t).toContain('Program readiness: 64 of 100');
    expect(t).toContain('CMC: 8');
    expect(t).toContain('Clinical: 3');
    expect(t).not.toContain('Charts are not reproduced');
    const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await getDocument({ data: new Uint8Array(out.bytes), disableFontFace: true }).promise;
    try {
      const operators = await (await document.getPage(1)).getOperatorList();
      // Actual stroked vector paths are present; a text-only chart placeholder
      // would retain zero stroke operators despite having the same labels.
      expect(operators.fnArray.filter((op: number, i: number) => op === OPS.stroke || (op === OPS.constructPath && operators.argsArray[i][0] === OPS.stroke)).length).toBeGreaterThanOrEqual(2);
    } finally { await document.destroy(); }
  });

  it('retains supplied stacked segments and discloses an unsupported visualization without asserting they are absent', async () => {
    const report: RenderedReport = { ...REPORT, sections: [{ id: 's', title: 'Recorded breakdown', blocks: [
      { kind: 'chart', chartType: 'stacked_bar', spec: { data: [{ label: 'Quarter 1', value: 10, segments: [{ label: 'Completed', value: 6 }, { label: 'Pending', value: 4 }] }] } },
    ] }] };
    const t = await textOf((await buildRunPdf(base({ report }))).bytes);
    expect(t).toContain('visualization is unavailable');
    expect(t).toContain('"segments"');
    expect(t).toContain('"Completed"');
    expect(t).toContain('"Pending"');
    expect(t).not.toContain('no segment breakdown was recorded');
  });
});
