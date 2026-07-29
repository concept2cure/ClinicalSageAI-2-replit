/**
 * pdf-parse ESM interop shim.
 *
 * pdf-parse is CommonJS (`module.exports = fn`) and provides no ESM `default`
 * export, so `import pdfParse from 'pdf-parse'` throws under tsx / Node ESM
 * ("does not provide an export named 'default'") and aborts whatever route or
 * worker imports it. createRequire loads it through the CJS resolver — the
 * same pattern as server/middleware/authAdapter.ts. Import from here instead
 * of importing 'pdf-parse' directly.
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export interface PdfParseResult {
  text: string;
  numpages?: number;
  info?: Record<string, unknown>;
  metadata?: unknown;
  version?: string;
}

const pdfParse = require('pdf-parse') as (
  dataBuffer: Buffer,
  options?: Record<string, unknown>,
) => Promise<PdfParseResult>;

export default pdfParse;
export { pdfParse };
