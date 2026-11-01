/**
 * Flag off, Vault ingestion is byte-identical (P-90 evidence; README.md beside it).
 * Run from the repository root:
 *   npx tsx docs/evidence/D2-LAYOUT-READER/2026-11-01/flag-off-identity/identity.ts <pdf-list> <label> <yes|no layout> <out.json>
 * (The runs in this folder were made with the script at server/services/ocr/, the same code.)
 * Each PDF is read as Vault's sweep reads it and as its upload request reads it,
 * and the method, length, SHA-256 of the text, SHA-256 of the whole result and
 * the result's keys are written out.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extractDocumentText, AUTOMATIC_PDF_OCR_BUDGET } from '../../../../../server/services/ocr/extractDocumentText';

const [list, label, withLayout, outPath] = process.argv.slice(2);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const digest = (r: Awaited<ReturnType<typeof extractDocumentText>>) => ({
  method: r.method, chars: r.text.length, text: sha(r.text), result: sha(JSON.stringify(r)), keys: Object.keys(r).sort(),
});

(async () => {
  const out: Record<string, unknown> = {};
  for (const file of readFileSync(list, 'utf8').split('\n').filter(Boolean)) {
    const bytes = readFileSync(file);
    const name = file.split('/').pop()!;
    const layout = withLayout === 'yes' ? { layout: true } : {};
    const sweep = await extractDocumentText(bytes, 'application/pdf', name, { pdfOcrBudget: AUTOMATIC_PDF_OCR_BUDGET, ...layout } as never);
    const inline = await extractDocumentText(bytes, 'application/pdf', name, { ocr: false, ...layout } as never);
    out[file] = { sweep: digest(sweep), inline: digest(inline) };
  }
  writeFileSync(outPath, JSON.stringify({ label, flag: process.env.OSS_INGESTION_DOCLING_PRIMARY ?? '(unset)', files: out }, null, 1));
})();
