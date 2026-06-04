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
  /** Contains an `/Encrypt` dictionary — eCTD prohibits encrypted/secured PDFs. */
  encrypted: boolean;
  /** Acceptable for an eCTD leaf on the basis of this detection. */
  acceptableForEctd: boolean;
  /** Human-readable reason for the verdict. */
  reason: string;
}

// PDF headers/markers are ASCII; scan a bounded window so huge files stay cheap.
const HEAD_BYTES = 1024;
const SCAN_BYTES = 512 * 1024; // XMP metadata appears early; cap the scan.

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

  // /Encrypt presence => secured PDF (eCTD prohibits security/encryption).
  const encrypted = /\/Encrypt\b/.test(scan);

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

export default { classifyPdfA };
