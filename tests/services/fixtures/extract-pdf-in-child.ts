/**
 * Runs extractDocumentText on one PDF in its own process and prints the
 * outcome as JSON. Used by scanned-pdf-native-canvas.test.ts: the defect it
 * guards against is a native abort, which no try/catch in the test process
 * could observe — only an exit status can.
 */
import { readFileSync } from 'node:fs';
import { extractDocumentText } from '../../../server/services/ocr/extractDocumentText';
import { ocrService } from '../../../server/services/ocr';

const out = await extractDocumentText(readFileSync(process.argv[2]), 'application/pdf', 'scan.pdf');
await ocrService.shutdown();
process.stdout.write(`${JSON.stringify({ method: out.method, text: out.text })}\n`);
