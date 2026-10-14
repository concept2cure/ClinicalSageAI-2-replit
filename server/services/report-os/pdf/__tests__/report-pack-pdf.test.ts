/** Complete retained packet output, including each overflow page's own identity/status.
 * Fixtures are renderer inputs, not proof of real database authorization or seals. */
import { describe, expect, it } from 'vitest';
import { buildReportPackPdf, type ReportPackPdfInput, type ReportPackPdfItem } from '../bundle-pdf';
import type { RunSealView } from '../../sealing/run-seal';

type PdfParseCtor = new (opts: { data: Buffer }) => {
  getText(): Promise<{ text: string; pages: Array<{ num: number; text: string }> }>;
  destroy(): Promise<void>;
};
async function readPdf(bytes: Buffer) {
  const { PDFParse } = (await import('pdf-parse')) as unknown as { PDFParse: PdfParseCtor };
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return { text: result.text.replace(/\s+/g, ' '), pages: result.pages.map(page => ({ ...page, text: page.text.replace(/\s+/g, ' ') })) };
  } finally { await parser.destroy(); }
}

function seal(runId: number): RunSealView {
  return { runId, sealed: true, seal: { algorithm: 'sha256', contentHash: 'a'.repeat(64), atomCount: 1, sealedAt: '2026-10-01T09:00:00.000Z' },
    finalizedAt: '2026-10-01T09:00:01.000Z', signature: { signerName: 'Dana Reyes', signedAt: '2026-10-01T09:00:01.000Z', meaning: 'approval' },
    finalization: { reason: 'Reviewed retained QA fixture', meaning: 'approval', priorStatus: 'completed' },
    verification: { verdict: 'intact', checks: [{ check: 'audit-chain', ok: true, detail: 'Verified fixture input' }] } };
}
function item(runId: number, status: 'partial' | 'final' = 'partial'): ReportPackPdfItem {
  return { bundledStatus: 'partial', sourceDocument: status === 'final' ? 'verified-sealed' : 'retained-run-render',
    content: { run: { id: runId, runUuid: `run-${runId}`, reportTypeId: `fixture.report_${runId}`, scopeType: 'project', scopeId: '12', status,
      confidence: null, createdAt: '2026-10-01T08:00:00.000Z' }, typeLabel: `Retained report ${runId}`, runBy: 'Sam Lee', seal: status === 'final' ? seal(runId) : null,
      report: { reportTypeId: `fixture.report_${runId}`, scopeType: 'project', scopeId: '12', generatedAt: '2026-10-01T08:00:00.000Z', status,
        computedScope: 'project', sections: [{ id: 'body', title: `Recorded body ${runId}`, blocks: [{ kind: 'summary', text: `RETAINED-BODY-${runId}` }] }] } } };
}
function input(items: ReportPackPdfItem[] = [item(41), item(42, 'final')]): ReportPackPdfInput {
  return { bundle: { bundleId: 'b1b2b3b4-0000-4000-8000-000000000001', name: 'Review pack', createdAt: '2026-09-30T12:00:00.000Z' },
    bundledBy: 'Sam Lee', items, exportId: 'exp-pack-9', exportedAt: '2026-10-01T10:00:00.000Z' };
}

describe('complete retained report PDF packets', () => {
  it('includes complete distinct bodies in recorded order with tables, recorded charts, source/calculation evidence and multilingual text', async () => {
    const first = item(42, 'final'), second = item(41);
    first.content.report.provenance = { source: 'retained QA snapshot', measured: 3 };
    first.content.report.sections.push({ id: 'data', title: 'Recorded data', blocks: [
      { kind: 'table', columns: ['Region', 'Recorded count'], rows: [['日本語', 3], ['中文报告', 2]], provenance: [{ sourceTable: 'qa_fixture', recordId: 42, auditId: 'qa-audit' }] },
      { kind: 'chart', chartType: 'bar', spec: { data: [{ label: 'Recorded', value: 3 }] } },
      { kind: 'summary', text: 'تقرير الامتثال — דוח תאימות — 한국어 — LAST-RECORDED-DATA' },
    ] });
    const out = await buildReportPackPdf(input([first, second]));
    const pdf = await readPdf(out.bytes);
    expect(pdf.text.indexOf('RETAINED-BODY-42')).toBeLessThan(pdf.text.indexOf('RETAINED-BODY-41'));
    for (const text of ['日本語', '中文报告', '한국어', 'تقرير الامتثال', 'דוח תאימות', 'LAST-RECORDED-DATA', 'Recorded: 3',
      'Source: qa_fixture #42; audit qa-audit', 'Recorded calculation evidence', '"measured": 3', 'Signed by Dana Reyes as approval', 'Seal verification at export: intact.']) expect(pdf.text).toContain(text);
    expect(pdf.text).toContain('This packet contains non-final reports');
    expect(pdf.text).toContain('has no separate approval or signature');
    expect(out.replacedCharacters).toBe(0);
    expect(out.constituents.map(entry => entry.runId)).toEqual([42, 41]);
    expect(out.constituents.map(entry => entry.sourceDocument)).toEqual(['verified-sealed', 'retained-run-render']);
  });

  it('keeps each run identity/status on every body and calculation appendix overflow page without marking another run', async () => {
    const partial = item(41), final = item(42, 'final');
    for (const entry of [partial, final]) {
      entry.content.report.sections[0].blocks = [{ kind: 'blocker-list', items: Array.from({ length: 65 }, (_, n) => `Run ${entry.content.run.id} retained line ${n + 1}`) }];
      entry.content.report.provenance = { records: Array.from({ length: 20 }, (_, n) => ({ source: `Run ${entry.content.run.id} calculation ${n + 1}`, value: n })), end: `APPENDIX-END-${entry.content.run.id}` };
    }
    const out = await buildReportPackPdf(input([partial, final]));
    const pdf = await readPdf(out.bytes);
    expect(pdf.pages).toHaveLength(out.pages);
    expect(out.constituents[0].firstPage).toBeGreaterThan(1);
    expect(out.constituents[0].lastPage + 1).toBe(out.constituents[1].firstPage);
    expect(out.constituents[1].lastPage).toBe(out.pages);
    for (const entry of out.constituents) {
      expect(entry.lastPage).toBeGreaterThan(entry.firstPage);
      const pages = pdf.pages.filter(page => page.num >= entry.firstPage && page.num <= entry.lastPage);
      expect(pages).toHaveLength(entry.lastPage - entry.firstPage + 1);
      for (const page of pages) {
        expect(page.text).toContain(`Run #${entry.runId} · project 12`);
        expect(page.text).toContain(`Page ${page.num} of ${out.pages}`);
        expect(page.text).toContain('Export exp-pack-9 · Exported 2026-10-01T10:00:00.000Z');
        if (entry.statusAtRead === 'partial') expect(page.text).toContain('NOT FINAL (PARTIAL)');
        else expect(page.text).not.toContain('NOT FINAL');
      }
      expect(pages.at(-1)?.text).toContain(`APPENDIX-END-${entry.runId}`);
    }
    expect(out.constituents[0]).toMatchObject({ bundledStatus: 'partial', statusAtRead: 'partial', sealVerdict: null, sealHash: null });
    expect(out.constituents[1]).toMatchObject({ bundledStatus: 'partial', statusAtRead: 'final', sealVerdict: 'intact', sealHash: 'a'.repeat(64) });
  });

  it('marks a legacy final reconstructed copy as unverified on each page and retains missing signature facts', async () => {
    const legacy = item(43, 'final');
    legacy.sourceDocument = 'retained-run-render';
    legacy.content.seal = { ...seal(43), signature: null, seal: null, verification: { verdict: 'not-verifiable', checks: [{ check: 'stored-document', ok: false, detail: 'No stored sealed document.' }] } };
    legacy.content.report.sections[0].blocks = [{ kind: 'blocker-list', items: Array.from({ length: 80 }, (_, n) => `Retained legacy line ${n + 1}`) }];
    const out = await buildReportPackPdf(input([legacy]));
    const pdf = await readPdf(out.bytes);
    expect(pdf.text).toContain('Their reconstructed copies are marked UNVERIFIED FINAL COPY.');
    expect(pdf.text).toContain('The sealed content cannot be verified.');
    expect(pdf.text).toContain('Signed by not recorded as not recorded, not recorded (UTC).');
    expect(pdf.text).toContain('Seal verification at export: not-verifiable.');
    expect(pdf.text).not.toContain('Seal verification at export: intact.');
    const range = out.constituents[0];
    for (const page of pdf.pages.filter(page => page.num >= range.firstPage)) {
      expect(page.text).toContain('UNVERIFIED FINAL COPY');
      expect(page.text).toContain('Run #43 · project 12');
      expect(page.text).not.toContain('NOT FINAL');
    }
    expect(range).toMatchObject({ sourceDocument: 'retained-run-render', sealVerdict: 'not-verifiable', sealHash: null });
  });

  it('refuses an empty packet, repeated run, mismatched document identity or contradictory seal/source before rendering', async () => {
    const wrongScope = item(41); wrongScope.content.report.scopeId = 'private-other';
    const badSeal = item(42, 'final'); badSeal.content.seal!.verification.verdict = 'mismatch';
    const falseVerified = item(41); falseVerified.sourceDocument = 'verified-sealed';
    const wrongSigner = item(42, 'final'); wrongSigner.content.seal!.runId = 99;
    const rewritten = item(42); rewritten.content.seal = { ...seal(42), sealed: false, verification: { verdict: 'mismatch', checks: [] } };
    for (const entries of [[], [item(41), item(41)], [wrongScope], [badSeal], [falseVerified], [wrongSigner], [rewritten]]) {
      await expect(buildReportPackPdf(input(entries))).rejects.toMatchObject({ status: 422, code: 'REPORT_PACK_CONTENT_INVALID' });
    }
  });

  it('inherits the canonical glyph refusal instead of substituting packet evidence', async () => {
    const unsupported = item(41);
    unsupported.content.report.sections[0].blocks = [{ kind: 'summary', text: `Recorded evidence ${String.fromCodePoint(0x10ffff)}` }];
    await expect(buildReportPackPdf(input([unsupported]))).rejects.toMatchObject({ code: 'REPORT_PDF_GLYPH_UNSUPPORTED' });
  });
});
