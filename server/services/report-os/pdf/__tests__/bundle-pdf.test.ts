/**
 * The bundle PDF is a faithful copy of the bundle at export (reporting review
 * 2026-10-01, Part 11): every report listed, never cut; each report's status
 * now beside the status it was bundled at; how many are final; the bundle's
 * time labelled as when it was bundled; the export on every page.
 */
import { describe, expect, it } from 'vitest';
import { buildBundlePdf, type BundlePdfInput, type BundlePdfItem } from '../bundle-pdf';

type PdfParseCtor = new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> };
async function textOf(bytes: Buffer): Promise<string> {
  const { PDFParse } = (await import('pdf-parse')) as unknown as { PDFParse: PdfParseCtor };
  return (await new PDFParse({ data: bytes }).getText()).text.replace(/\s+/g, ' ');
}

const item = (runId: number, over: Partial<BundlePdfItem> = {}): BundlePdfItem => ({
  runId, label: 'Executive Readiness Digest', scopeType: 'project', scopeId: '12', bundledStatus: 'partial', currentStatus: 'partial', confidence: 64, ...over,
});
const base = (over: Partial<BundlePdfInput> = {}): BundlePdfInput => ({
  bundle: { bundleId: 'b1b2b3b4-0000-4000-8000-000000000001', name: 'Board pack', description: 'Q4 board', createdAt: '2026-09-30T12:00:00.000Z' },
  bundledBy: 'Sam Lee',
  items: [item(41), item(42, { bundledStatus: 'completed', currentStatus: 'final' })],
  exportId: 'exp-9',
  exportedAt: '2026-10-01T10:00:00.000Z',
  ...over,
});

describe('buildBundlePdf', () => {
  it("states each report's status now beside what it was bundled at, and how many are final", async () => {
    const t = await textOf((await buildBundlePdf(base())).bytes);
    expect(t).toContain('#41 Executive Readiness Digest - project 12 - status now: partial - confidence 64');
    expect(t).toContain('#42 Executive Readiness Digest - project 12 - status now: final (bundled as completed)');
    expect(t).toContain('1 of 2 report(s) are final at export.');
  });

  it("labels the bundle's time as when it was bundled, never as generated, and names who bundled it", async () => {
    const t = await textOf((await buildBundlePdf(base())).bytes);
    expect(t).toContain('Bundled: 2026-09-30T12:00:00.000Z (UTC)');
    expect(t).toContain('Bundled by: Sam Lee');
    expect(t).not.toMatch(/Generated:/);
    const missing = await textOf((await buildBundlePdf(base({ bundle: { ...base().bundle, createdAt: null }, bundledBy: null }))).bytes);
    expect(missing).toContain('Bundled: not recorded');
    expect(missing).toContain('Bundled by: not recorded');
  });

  it('lists every report, onto further pages, with the export on every page', async () => {
    const items = Array.from({ length: 120 }, (_, i) => item(i + 1));
    const { bytes, pages } = await buildBundlePdf(base({ items }));
    const t = await textOf(bytes);
    expect(pages).toBeGreaterThan(1);
    for (const n of [1, 60, 120]) expect(t).toContain(`#${n} Executive`);
    expect(t.match(/Export exp-9 · Exported 2026-10-01T10:00:00\.000Z \(UTC\)/g)?.length).toBe(pages);
    expect(t).toContain(`Page ${pages} of ${pages}`);
  });

  it('a report that can no longer be read says so', async () => {
    const t = await textOf((await buildBundlePdf(base({ items: [item(7, { currentStatus: null })] }))).bytes);
    expect(t).toContain('#7 Executive Readiness Digest - project 12 - status now: no longer found (bundled as partial)');
    expect(t).toContain('0 of 1 report(s) are final at export.');
  });
});
