// Flag off, Vault chunks are unchanged (P-90 follow-up evidence). Mode "texts": extract each PDF as the sweep
// does and save the texts. Mode "chunks": chunk the saved texts as ingest does (no table spans) and write digests.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extractDocumentText, AUTOMATIC_PDF_OCR_BUDGET } from '../../../../../server/services/ocr/extractDocumentText';
import { chunkExtractedText } from '../../../../../server/services/vault/document-chunking.service';
const [mode, a, b] = process.argv.slice(2);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
(async () => {
  if (mode === 'texts') {
    const out: Record<string, string> = {};
    for (const file of readFileSync(a, 'utf8').split('\n').filter(Boolean)) {
      const r = await extractDocumentText(readFileSync(file), 'application/pdf', file.split('/').pop()!, { pdfOcrBudget: AUTOMATIC_PDF_OCR_BUDGET, layout: true } as never);
      out[file] = r.text;
    }
    writeFileSync(b, JSON.stringify(out));
  } else {
    const texts = JSON.parse(readFileSync(a, 'utf8')) as Record<string, string>;
    const out: Record<string, unknown> = {};
    for (const [file, text] of Object.entries(texts)) {
      const chunks = chunkExtractedText(text);
      out[file] = { chunks: chunks.length, digest: sha(JSON.stringify(chunks)) };
    }
    writeFileSync(b, JSON.stringify(out, null, 1));
  }
})();
