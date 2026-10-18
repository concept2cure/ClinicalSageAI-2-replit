// Live probe: real pdfjs rasterizer + WASM Tesseract, no mocks, no database.
// Usage (repo root): npx tsx docs/evidence/D2-OCR-BUDGET/2026-10-18/live-probe.mts
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { ocrService } from '../../../../server/services/ocr/ocrService.ts';
import { extractDocumentText } from '../../../../server/services/ocr/extractDocumentText.ts';
import { extractCapture } from '../../../../server/services/clinical-regulatory-evidence/data-room-processing.ts';

function pagePng(i: number): Buffer {
  const c = createCanvas(1275, 1650); const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 1275, 1650); g.fillStyle = '#000'; g.font = '32px sans-serif';
  for (let l = 0; l < 6; l++) g.fillText(`Page ${i} line ${l} adverse event rate 12 percent`, 60, 100 + l * 60);
  return c.toBuffer('image/png');
}
const doc = await PDFDocument.create();
for (let i = 1; i <= 3; i++) { const png = await doc.embedPng(pagePng(i)); doc.addPage([612, 792]).drawImage(png, { x: 0, y: 0, width: 612, height: 792 }); }
const pdf = Buffer.from(await doc.save());
const out = (step: string, v: unknown) => process.stdout.write(JSON.stringify({ step, ...(v as object) }) + '\n');

const plain = await extractDocumentText(pdf, 'application/pdf', 'scan.pdf');
out('extract-no-budget', { method: plain.method, coverage: plain.coverage, pageSpans: plain.pageSpans?.length });
const budgeted = await extractDocumentText(pdf, 'application/pdf', 'scan.pdf', { pdfOcrBudget: { maxPages: 2, maxDurationMs: 600_000 } });
out('extract-data-room-style-budget-2-pages', { method: budgeted.method, coverage: budgeted.coverage, pageSpans: budgeted.pageSpans?.length });
const capped = await ocrService.ocrPdfToText(pdf, { maxPages: 2 });
out('maxPages-2', { coverage: capped.coverage, pagesInText: capped.pages.length, renderedDpi: capped.pageDetails.map(d => d.dpi) });
const late = await ocrService.ocrPdfToText(pdf, { deadlineAt: Date.now() });
out('deadline-passed', { coverage: late.coverage, pagesInText: late.pages.length });
const capture = await extractCapture(pdf, 'application/pdf', 'scan.pdf');
out('capture', { method: capture.method, pageCount: capture.pageCount, coverage: capture.coverage, words: capture.words });
await ocrService.shutdown();
