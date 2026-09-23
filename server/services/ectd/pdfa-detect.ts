/**
 * PDF/A conformance detection — architecture spec §5.1 (detection-only)
 *
 * Pure byte inspection that classifies a PDF: version, declared PDF/A part &
 * conformance level (from embedded XMP), and encryption. The audit found the
 * eCTD path has a PDF/A *rule* (`ectd-regional-rules.ts` FDA-ESG-006) and a
 * `pdf_a_compliant` flag stubbed in `ectd-submission-agent.ts` but NO actual
 * check; this provides the deterministic detection those can call.
 *
 * SCOPE: detection, not validation. A true PDF/A-1b/2b/3b compliance verdict
 * needs a full parser (e.g. veraPDF) or normalization needs an external binary
 * (Ghostscript) — both out of scope for a pure module. This reliably answers
 * "is it a PDF, what version, does it *claim* PDF/A, and is it encrypted
 * (which eCTD forbids)" — enough to gate the obvious failures.
 *
 * PURE + DETERMINISTIC: no DB, no filesystem, no network.
 *
 * @module server/services/ectd/pdfa-detect
 */

export interface PdfAClassification {
  /** Starts with a `%PDF-` header. */
  isPdf: boolean;
  /** PDF version from the header (e.g. '1.4', '1.7', '2.0'), or null. */
  pdfVersion: string | null;
  /** XMP declares a PDF/A identifier (`pdfaid:part`). */
  pdfAClaimed: boolean;
  /** Declared PDF/A part ('1' | '2' | '3'), or null. */
  pdfAPart: string | null;
  /** Declared conformance level ('A' | 'B' | 'U'), or null. */
  pdfAConformance: string | null;
  /**
   * An `/Encrypt` name token appears anywhere in the file (decoded, whole
   * buffer) — eCTD prohibits encrypted/secured PDFs. See pdfNameOffsets.
   */
  encrypted: boolean;
  /** Acceptable for an eCTD leaf on the basis of this detection. */
  acceptableForEctd: boolean;
  /** Human-readable reason for the verdict. */
  reason: string;
}

// PDF headers/markers are ASCII; scan a bounded window so huge files stay cheap.
const HEAD_BYTES = 1024;
const SCAN_BYTES = 512 * 1024; // XMP metadata appears early; cap the scan.

/*
 * 2026-09-22 (W5 / D7): the encryption test no longer reads windows.
 *
 * It read a 512 KB head window plus a 64 KB tail window, and the tail was only
 * taken when it started past the head (`tailStart > SCAN_BYTES`). A file of
 * 513-575 KB therefore had its last 1-63 KB read by neither, and that is where
 * the trailer carrying /Encrypt lives: a secured leaf in that band packaged and
 * transmitted as unsecured. A #-escaped spelling (/Encr#79pt, which every
 * reader decodes to /Encrypt) and an /Encrypt in an earlier incremental section
 * in the middle of a large file were missed at every size.
 *
 * No window is needed. ISO 32000-1 puts /Encrypt only in a trailer or a
 * cross-reference stream dictionary, neither of which may be compressed or
 * stored in an object stream, so the name is always present in the raw bytes. A
 * whole-buffer scan for the decoded name is complete by construction: a file
 * with no such token cannot be opened as encrypted by any reader, including one
 * that rebuilds a damaged file from every trailer it can find.
 */

/** PDF whitespace and delimiters (ISO 32000-1 §7.2.2): the bytes that end a name token. */
const NAME_TERMINATORS = new Set([
  0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20, // whitespace
  0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25, // ( ) < > [ ] { } / %
]);

function hexNibble(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x41 && c <= 0x46) return c - 0x37;
  if (c >= 0x61 && c <= 0x66) return c - 0x57;
  return -1;
}

/**
 * Byte offsets of every name token in `bytes` that decodes exactly to `name`.
 *
 * Scans the WHOLE buffer. A name token is `/` followed by regular characters up
 * to the next whitespace or delimiter; `#xx` is a hex escape for one byte
 * (§7.3.5), decoded the way pdf.js and Acrobat decode it, so `/Encr#79pt` is
 * `/Encrypt` and `/EncryptMetadata` is not. Offsets point at the `/`.
 */
export function pdfNameOffsets(bytes: Uint8Array, name: string): number[] {
  const target = Buffer.from(name, 'latin1');
  const out: number[] = [];
  const n = bytes.length;
  let i = bytes.indexOf(0x2f);
  while (i !== -1) {
    let j = i + 1;
    let k = 0;
    let matched = true;
    while (j < n && !NAME_TERMINATORS.has(bytes[j])) {
      let c = bytes[j];
      if (c === 0x23 && j + 2 < n && hexNibble(bytes[j + 1]) >= 0 && hexNibble(bytes[j + 2]) >= 0) {
        c = hexNibble(bytes[j + 1]) * 16 + hexNibble(bytes[j + 2]);
        j += 3;
      } else {
        j += 1;
      }
      if (k >= target.length || c !== target[k]) {
        matched = false;
        break;
      }
      k += 1;
    }
    if (matched && k === target.length) out.push(i);
    i = bytes.indexOf(0x2f, i + 1);
  }
  return out;
}

/**
 * True when `%PDF-` appears in the first 1 KB — the same test readers apply
 * (pdf.js and Acrobat tolerate a short preamble), and the one classifyPdfA
 * uses for `isPdf`. Callers deciding whether bytes are a PDF use this, not the
 * file name.
 */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  return /%PDF-\d+\.\d+/.test(toLatin1(bytes, 0, HEAD_BYTES));
}

function toLatin1(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  const stop = Math.min(end, bytes.length);
  for (let i = start; i < stop; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Classify a PDF buffer for eCTD acceptability. */
export function classifyPdfA(input: Uint8Array | ArrayBuffer): PdfAClassification {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  const header = toLatin1(bytes, 0, HEAD_BYTES);
  const headerMatch = header.match(/%PDF-(\d+\.\d+)/);
  const isPdf = headerMatch !== null;
  const pdfVersion = headerMatch ? headerMatch[1] : null;

  if (!isPdf) {
    return {
      isPdf: false,
      pdfVersion: null,
      pdfAClaimed: false,
      pdfAPart: null,
      pdfAConformance: null,
      encrypted: false,
      acceptableForEctd: false,
      reason: 'Not a PDF (missing %PDF- header).',
    };
  }

  const scan = toLatin1(bytes, 0, SCAN_BYTES);

  // XMP PDF/A identifiers appear as either attributes or elements:
  //   pdfaid:part="1"  /  <pdfaid:part>1</pdfaid:part>
  const partMatch = scan.match(/pdfaid:part\s*=\s*["'](\d)["']/) || scan.match(/<pdfaid:part>\s*(\d)\s*<\/pdfaid:part>/);
  const confMatch =
    scan.match(/pdfaid:conformance\s*=\s*["']([ABU])["']/i) ||
    scan.match(/<pdfaid:conformance>\s*([ABU])\s*<\/pdfaid:conformance>/i);

  const pdfAPart = partMatch ? partMatch[1] : null;
  const pdfAConformance = confMatch ? confMatch[1].toUpperCase() : null;
  const pdfAClaimed = pdfAPart !== null;

  /* /Encrypt presence => secured PDF (eCTD prohibits security/encryption).
     Whole buffer, decoded names — see pdfNameOffsets. */
  const encrypted = pdfNameOffsets(bytes, 'Encrypt').length > 0;

  let acceptableForEctd = true;
  const reasons: string[] = [];
  if (encrypted) {
    acceptableForEctd = false;
    reasons.push('PDF is encrypted/secured (prohibited by the eCTD PDF spec).');
  }
  if (!pdfAClaimed) {
    reasons.push('No PDF/A identifier in XMP — PDF/A compliance is not declared (detection-only; run a full validator to confirm).');
  } else {
    reasons.push(`Declares PDF/A-${pdfAPart}${pdfAConformance ?? ''}.`);
  }

  return {
    isPdf: true,
    pdfVersion,
    pdfAClaimed,
    pdfAPart,
    pdfAConformance,
    encrypted,
    acceptableForEctd,
    reason: reasons.join(' '),
  };
}

export default { classifyPdfA, pdfNameOffsets, hasPdfHeader };
