/**
 * rasterize_page renders the page it was asked for, or says why not.
 *
 * It returned `success: true`, a note that rasterization was "initiated" and a
 * shell command it never ran — no file, whatever the input, including a path
 * outside the tenant's workspace. pdf_overlay likewise reported overlays
 * "queued" and applied none. Now rasterize_page confines its input, renders
 * the page to a PNG in the tenant's scratch area and succeeds only when that
 * file exists; pdf_overlay says it is unavailable and writes nothing.
 */
import { describe, it, expect, vi, afterAll, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const { runDocxPdfPipeline } = vi.hoisted(() => ({ runDocxPdfPipeline: vi.fn() }));
vi.mock('../../docx-pdf-pipeline', () => ({ runDocxPdfPipeline }));
vi.mock('../../docx-pdf-pipeline.js', () => ({ runDocxPdfPipeline }));

import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const ORG = 424242;
const dir = path.resolve(process.cwd(), 'tmp', 'docbuilder', `org-${ORG}`, 'rasterize-test');
const pdfPath = path.join(dir, 'three-pages.pdf');

async function threePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  // Page 2 is landscape, so its render has a different shape from pages 1 and 3.
  doc.addPage([612, 792]);
  doc.addPage([792, 612]);
  doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

const run = async (tool: string, input: Record<string, unknown>, ctx: Record<string, unknown> = { organizationId: ORG }) =>
  JSON.parse(await getToolHandler(tool)!(input, ctx as any));

beforeAll(async () => {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(pdfPath, await threePagePdf());
});
afterAll(async () => {
  await fs.rm(path.resolve(process.cwd(), 'tmp', 'docbuilder', `org-${ORG}`), { recursive: true, force: true });
});

describe('rasterize_page', () => {
  it('writes a PNG of the page asked for, and succeeds only when it exists', async () => {
    const out = await run('rasterize_page', { document_path: pdfPath, page_number: 2, dpi: 72 });
    expect(out.success).toBe(true);
    const png = await fs.readFile(out.pngPath);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(out).toMatchObject({ page: 2, pageCount: 3, dpi: 72, widthPx: 792, heightPx: 612, bytes: png.length });
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.pngPath.startsWith(path.resolve(process.cwd(), 'tmp', 'docbuilder', `org-${ORG}`))).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/pdftoppm|libreoffice --headless|initiated/);
  });

  it('refuses a page the document does not have, naming how many it has', async () => {
    const out = await run('rasterize_page', { document_path: pdfPath, page_number: 5 });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/has 3 pages/);
  });

  it('refuses a path outside the tenant\'s workspace without opening it', async () => {
    const out = await run('rasterize_page', { document_path: 'dist/index.js' });
    expect(out.success).not.toBe(true);
    expect(out.error).toMatch(/document_path/);
  });

  it('refuses another tenant\'s file', async () => {
    const out = await run('rasterize_page', { document_path: pdfPath }, { organizationId: ORG + 1 });
    expect(out.success).not.toBe(true);
  });

  it('converts a DOCX through the one DOCX→PDF pipeline first', async () => {
    const docx = path.join(dir, 'memo.docx');
    await fs.writeFile(docx, 'not really a docx; the pipeline is mocked');
    runDocxPdfPipeline.mockImplementation(async ({ outputPdfPath }: { outputPdfPath: string }) => {
      await fs.writeFile(outputPdfPath, await threePagePdf());
      return { inputDocx: docx, convertedPdf: outputPdfPath, finalPdf: outputPdfPath };
    });
    const out = await run('rasterize_page', { document_path: docx, page_number: 1, dpi: 72 });
    expect(runDocxPdfPipeline).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ success: true, page: 1, widthPx: 612, heightPx: 792 });
    expect(out.convertedPdf).toMatch(/memo\.pdf$/);
  });

  it('reports a failed conversion as a failure', async () => {
    const docx = path.join(dir, 'broken.docx');
    await fs.writeFile(docx, 'x');
    runDocxPdfPipeline.mockRejectedValue(new Error('LibreOffice (soffice) is not installed'));
    const out = await run('rasterize_page', { document_path: docx });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/soffice/);
  });
});

describe('pdf_overlay', () => {
  it('says it is unavailable and writes nothing, instead of reporting overlays queued', async () => {
    const before = await fs.readdir(dir);
    // An approved model, so the governed-write gate lets the call reach the handler.
    const out = await run(
      'pdf_overlay',
      { base_pdf_path: pdfPath, overlays: [{ page: 1, type: 'stamp', x: 10, y: 10, content: 'APPROVED' }] },
      { organizationId: ORG, servingModel: { provider: 'anthropic', model: 'claude-opus-5' } },
    );
    expect(out.success).toBe(false);
    expect(out.status).toBe('unavailable');
    expect(JSON.stringify(out)).not.toMatch(/queued|will be applied/);
    expect(await fs.readdir(dir)).toEqual(before);
  });

  it('does not offer signatures or approval stamps in its definition', () => {
    const def = ALL_ANA_TOOLS.find((t) => t.name === 'pdf_overlay')!;
    expect(def.description).not.toMatch(/signature|approval stamp/i);
    expect(def.description).toMatch(/unavailable/i);
  });
});
