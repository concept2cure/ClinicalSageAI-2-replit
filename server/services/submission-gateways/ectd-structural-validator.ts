/**
 * Internal eCTD structural validation.
 *
 * Runs at assemble-time over the in-memory leaf set, before the zip is written.
 * The findings are stored on the bundle descriptor and surfaced as pre-flight
 * data to the UI; transmit hard-blocks when any error-severity finding exists.
 *
 * IMPORTANT — scope: this is INTERNAL structural validation only (media types,
 * PDF magic bytes, empty sections, module presence). It is NOT an agency
 * validator (FDA eValidator / EMA / PMDA) and does NOT assert technical
 * conformance. It is necessary-but-not-sufficient: passing here does not mean a
 * real agency submission would pass. Staging remains the honest destination.
 */

export interface EctdFinding {
  severity: 'error' | 'warning' | 'info';
  ruleId: string;
  message: string;
  filePath?: string;
}

export interface EctdValidationResult {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  findings: EctdFinding[];
}

const PDF_MAGIC = Buffer.from('%PDF-', 'utf8');
const EMPTY_SECTION_MARKER = '[EMPTY SECTION]';

interface EctdLeaf {
  path: string;
  mediaType: string;
  content: Buffer;
}

/**
 * Validate a set of eCTD leafs. Deterministic, in-memory, no XML parsing.
 *
 * @param leafs The assembled leafs (path, mediaType, PDF content buffer).
 * @param opts.region eCTD region (informational; reserved for region rules).
 * @param opts.emptyLeafPaths Paths the caller already flagged empty (in addition
 *        to leafs whose content begins with the `[EMPTY SECTION]` marker).
 */
export function validateEctdLeafs(
  leafs: EctdLeaf[],
  opts: { region: string; emptyLeafPaths?: string[] },
): EctdValidationResult {
  const findings: EctdFinding[] = [];
  const emptySet = new Set(opts.emptyLeafPaths ?? []);

  // BUNDLE-EMPTY: a bundle with no leafs is structurally invalid.
  if (leafs.length === 0) {
    findings.push({
      severity: 'error',
      ruleId: 'BUNDLE-EMPTY',
      message: 'Bundle contains no leafs; nothing to transmit.',
    });
  }

  let emptyLeafCount = 0;
  let hasM1 = false;

  for (const leaf of leafs) {
    if (leaf.path.startsWith('m1/')) hasM1 = true;

    // LEAF-MEDIATYPE: every leaf must be a PDF.
    if (leaf.mediaType !== 'application/pdf') {
      findings.push({
        severity: 'error',
        ruleId: 'LEAF-MEDIATYPE',
        message: `Leaf media type must be application/pdf, got ${leaf.mediaType}.`,
        filePath: leaf.path,
      });
    } else if (
      // LEAF-CORRUPT: a PDF leaf must begin with the %PDF- magic bytes.
      !(leaf.content && leaf.content.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC))
    ) {
      findings.push({
        severity: 'error',
        ruleId: 'LEAF-CORRUPT',
        message: 'PDF leaf does not begin with the %PDF- magic bytes (corrupt or non-PDF content).',
        filePath: leaf.path,
      });
    }

    // SECTION-EMPTY: an empty-section placeholder leaf (warning, not blocking).
    const startsWithMarker =
      leaf.content &&
      leaf.content
        .subarray(0, 4096)
        .toString('utf8')
        .includes(EMPTY_SECTION_MARKER);
    if (emptySet.has(leaf.path) || startsWithMarker) {
      emptyLeafCount += 1;
      findings.push({
        severity: 'warning',
        ruleId: 'SECTION-EMPTY',
        message: 'Section has no mapped artifact content (empty placeholder leaf).',
        filePath: leaf.path,
      });
    }
  }

  // MODULE-M1-MISSING: module 1 (regional administrative) should be present.
  if (leafs.length > 0 && !hasM1) {
    findings.push({
      severity: 'warning',
      ruleId: 'MODULE-M1-MISSING',
      message: 'No module 1 (m1/) leaf is present; regional administrative content is expected.',
    });
  }

  // SUMMARY: informational leaf/empty counts.
  findings.push({
    severity: 'info',
    ruleId: 'SUMMARY',
    message: `${leafs.length} leaf(s), ${emptyLeafCount} empty section(s), region ${opts.region}.`,
  });

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const f of findings) {
    if (f.severity === 'error') errorCount += 1;
    else if (f.severity === 'warning') warningCount += 1;
    else infoCount += 1;
  }

  return { errorCount, warningCount, infoCount, findings };
}
