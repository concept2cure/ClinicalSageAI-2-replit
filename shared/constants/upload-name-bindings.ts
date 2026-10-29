/**
 * The type each file extension is declared as on upload, and the types it may
 * be declared as. One table for both sides: the server binds a name to its
 * declared type and to the signature the canonical type promises
 * (server/utils/fileSignature.ts), and a browser that builds a File itself (a
 * .zip's entries, archive-intake.ts) declares the canonical type from here, so
 * it never sends a type the server's binding refuses.
 */
export interface NameBinding {
  canonical: string;
  declared: readonly string[];
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const JPEG_NAME: NameBinding = { canonical: 'image/jpeg', declared: ['image/jpeg', 'image/jpg'] };

export const UPLOAD_NAME_BINDINGS: ReadonlyMap<string, NameBinding> = new Map<string, NameBinding>([
  ['.pdf', { canonical: 'application/pdf', declared: ['application/pdf'] }],
  ['.png', { canonical: 'image/png', declared: ['image/png'] }],
  ['.jpg', JPEG_NAME],
  ['.jpeg', JPEG_NAME],
  ['.gif', { canonical: 'image/gif', declared: ['image/gif'] }],
  ['.docx', { canonical: DOCX, declared: [DOCX] }],
  ['.xlsx', { canonical: XLSX, declared: [XLSX] }],
  ['.pptx', { canonical: PPTX, declared: [PPTX] }],
  ['.doc', { canonical: 'application/msword', declared: ['application/msword'] }],
  ['.xls', { canonical: 'application/vnd.ms-excel', declared: ['application/vnd.ms-excel'] }],
  // Text formats are sent under more than one name, and a multipart part with
  // no Content-Type at all reaches multer as text/plain (busboy's default).
  ['.txt', { canonical: 'text/plain', declared: ['text/plain'] }],
  ['.csv', { canonical: 'text/csv', declared: ['text/csv', 'application/csv', 'text/plain'] }],
  ['.tsv', { canonical: 'text/tab-separated-values', declared: ['text/tab-separated-values', 'text/plain'] }],
  ['.json', { canonical: 'application/json', declared: ['application/json', 'text/json', 'text/plain'] }],
  ['.xml', { canonical: 'application/xml', declared: ['application/xml', 'text/xml', 'text/plain'] }],
  ['.md', { canonical: 'text/markdown', declared: ['text/markdown', 'text/x-markdown', 'text/plain'] }],
  ['.rtf', { canonical: 'text/rtf', declared: ['text/rtf', 'text/plain'] }],
  // A browser has no type for .xpt and sends application/octet-stream; that is
  // admitted for this name only, and only for bytes that are a v5 transport file.
  ['.xpt', { canonical: 'application/x-sas-xport', declared: ['application/x-sas-xport', 'application/octet-stream'] }],
  // The define.xml stylesheet. Browsers and operating systems send it under
  // any of these; each is checked as text, and it is stored as XSLT.
  ['.xsl', { canonical: 'application/xslt+xml', declared: ['application/xslt+xml', 'text/xsl', 'text/xml', 'application/xml', 'text/plain'] }],
  // A browser has no type for .ndjson either; octet-stream is checked as NDJSON text.
  ['.ndjson', { canonical: 'application/x-ndjson', declared: ['application/x-ndjson', 'application/json', 'text/plain', 'application/octet-stream'] }],
]);

/**
 * Types admitted for one bound name only. Declared for any other name, they
 * would carry a signature check written for that format (a transport file's
 * first record, NDJSON's text shape) under a name nothing binds, so a .tif or
 * .html could be stored as one (security review 2026-10-15, F3).
 */
export const NAME_ONLY_TYPES: ReadonlyMap<string, string> = new Map([
  ['application/x-sas-xport', '.xpt'],
  ['application/x-ndjson', '.ndjson'],
  ['application/xslt+xml', '.xsl'],
]);

/**
 * The lower-cased extension of a file name, with its dot ('' when none).
 * Trailing whitespace and dots are not part of it: `report.pdf ` and
 * `report.pdf.` are PDFs to every operating system and to the allowlist, and
 * reading them as unbound let a .pdf declared text/html past the name binding
 * (SEC-A-3, reopened by the security review of 2026-10-15, F2).
 */
export function extensionOf(fileName: string): string {
  const base = (String(fileName ?? '').split(/[\\/]/).pop() ?? '').replace(/[\s.]+$/, '');
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

/** The type to declare for a file of this name; '' for a name no binding covers. */
export function declaredTypeFor(fileName: string): string {
  return UPLOAD_NAME_BINDINGS.get(extensionOf(fileName))?.canonical ?? '';
}
