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
 *
 * Two entry points:
 *   - `validateEctdLeafs`   — assemble-time, over the in-memory leaf set.
 *   - `validateEctdPackage` — post-assembly / caller-supplied ZIP buffer:
 *     index.xml presence + well-formedness, backbone href → ZIP-entry
 *     resolution (root-relative for index.xml, file-relative for the regional
 *     backbone), module folder presence, DTD self-containment, and a full
 *     reopen-and-verify of util/index-md5.txt (the eCTD checksum contract).
 *     Ported here from the retired `ectdExportService` so ZIP-level structural
 *     validation has exactly one implementation, colocated with the canonical
 *     packager whose output it checks.
 */

import JSZip from 'jszip';
import * as path from 'path';
import { createHash } from 'crypto';

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

import { FILENAME_PATTERN } from '../ectd/ectd-regional-rules';

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
 * @param opts.enforceFileNames Apply the eCTD leaf file-name rule
 *        (FILENAME_PATTERN: lowercase [a-z0-9.-], ≤ 64 characters including the
 *        extension) as an ERROR. Set for eCTD bundles; a device form (eSTAR /
 *        EUDAMED) is not an eCTD leaf and is not subject to it.
 */
export function validateEctdLeafs(
  leafs: EctdLeaf[],
  opts: { region: string; emptyLeafPaths?: string[]; enforceFileNames?: boolean },
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

    // LEAF-FILENAME: the eCTD file-name rule the regional validator treats as
    // blocking (EMA-CESP-005). Nothing on the assemble/transmit path applied it
    // before, so a long section key shipped an 84-character leaf name with a
    // clean gate.
    if (opts.enforceFileNames) {
      const baseName = leaf.path.slice(leaf.path.lastIndexOf('/') + 1);
      if (!FILENAME_PATTERN.test(baseName)) {
        findings.push({
          severity: 'error',
          ruleId: 'LEAF-FILENAME',
          message: `Leaf file name '${baseName}' breaks the eCTD file-name rule (lowercase a-z, 0-9, '.', '-'; at most 64 characters including the extension).`,
          filePath: leaf.path,
        });
      }
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

// ─────────────────────────────────────────────────────────────────────────────
// ZIP-level structural validation (post-assembly / caller-supplied packages)
// ─────────────────────────────────────────────────────────────────────────────

export interface EctdZipValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Basic XML well-formedness check without a full parser: XML declaration,
 * balanced angle brackets, and balanced open/close tags.
 */
export function validateXmlWellFormedness(xml: string): string[] {
  const errors: string[] = [];

  if (!xml.trimStart().startsWith('<?xml')) {
    errors.push('Missing XML declaration (<?xml version="1.0" ...?>)');
  }

  const openCount = (xml.match(/</g) || []).length;
  const closeCount = (xml.match(/>/g) || []).length;
  if (openCount !== closeCount) {
    errors.push(`Unbalanced angle brackets: ${openCount} opening vs ${closeCount} closing`);
  }

  // Simplified tag-balance walk (not a full parser).
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9:_-]*)[^>]*\/?>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(xml)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1];
    // Skip processing instructions, comments/doctype, self-closing tags.
    if (fullMatch.startsWith('<?') || fullMatch.startsWith('<!') || fullMatch.endsWith('/>')) {
      continue;
    }
    if (fullMatch.startsWith('</')) {
      if (stack.length === 0) {
        errors.push(`Unexpected closing tag </${tagName}> with no matching open tag`);
        break;
      }
      const expected = stack.pop();
      if (expected !== tagName) {
        errors.push(`Mismatched tags: expected </${expected}>, found </${tagName}>`);
        break;
      }
    } else {
      stack.push(tagName);
    }
  }
  if (stack.length > 0 && errors.length === 0) {
    errors.push(`Unclosed tags: ${stack.join(', ')}`);
  }

  return errors;
}

/** Regional backbone entries: m1/us/us-regional.xml (canonical, nested) or the
 *  flat m1/us-regional.xml layout some external packages use. */
const REGIONAL_BACKBONE_RE = /^m1\/(?:[a-z]{2}\/)?[a-z]{2}-regional\.xml$/;

/**
 * Validate an eCTD package ZIP buffer for structural correctness.
 *
 * Checks:
 *  - required index.xml exists and is well-formed;
 *  - every xlink:href in index.xml resolves to a real ZIP entry (root-relative);
 *  - every xlink:href in each m1 regional backbone resolves relative to the
 *    backbone's own directory;
 *  - module folders m1–m5 are present (warning when absent);
 *  - a regional backbone exists under m1/ (warning when absent);
 *  - every other XML file in the package is well-formed;
 *  - DTD self-containment: a DOCTYPE-referenced DTD must be bundled under
 *    util/dtd/ or the package is not self-contained (warning);
 *  - util/index-md5.txt (the eCTD checksum contract) re-verifies against the
 *    actual ZIP bytes — a mismatch or a manifest entry naming a missing file is
 *    an error; a missing manifest is a warning.
 */
export async function validateEctdPackage(zipBuffer: Buffer): Promise<EctdZipValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch (e: any) {
    return { valid: false, errors: [`Invalid ZIP archive: ${e.message}`], warnings: [] };
  }

  const fileNames = Object.keys(zip.files).filter((f) => !zip.files[f].dir);

  // The eCTD file-name rule (FILENAME_PATTERN) on every packaged file. The
  // assemble path composes names to it, but this validator — the one the
  // export route runs by default — never checked, so an over-long leaf name
  // left with a clean gate.
  for (const f of fileNames) {
    const baseName = f.slice(f.lastIndexOf('/') + 1);
    if (!FILENAME_PATTERN.test(baseName)) {
      errors.push(`File name '${baseName}' breaks the eCTD file-name rule (lowercase a-z, 0-9, '.', '-'; at most 64 characters including the extension).`);
    }
  }

  // 1. index.xml exists, is well-formed, and its hrefs resolve.
  if (!fileNames.includes('index.xml')) {
    errors.push('Missing required file: index.xml (eCTD backbone)');
  } else {
    const indexContent = await zip.file('index.xml')!.async('string');
    errors.push(...validateXmlWellFormedness(indexContent).map((e) => `index.xml: ${e}`));

    for (const match of indexContent.match(/xlink:href="([^"]+)"/g) || []) {
      const href = match.replace('xlink:href="', '').replace(/"$/, '');
      if (!fileNames.includes(href)) {
        errors.push(`index.xml references file "${href}" which is not present in the package`);
      }
    }

    // DTD self-containment: index.xml declares a DTD via DOCTYPE; a
    // submission-ready package must bundle it under util/dtd/.
    const referencesDtd = /<!DOCTYPE[^>]*\.dtd"/i.test(indexContent);
    const hasBundledDtd = fileNames.some((f) => f.startsWith('util/dtd/') && f.endsWith('.dtd'));
    if (referencesDtd && !hasBundledDtd) {
      warnings.push(
        'index.xml references a DTD via DOCTYPE but no DTD is bundled under util/dtd/ — ' +
          'the package is not self-contained and is not submission-ready until the ICH/regional ' +
          'DTDs are vendored into util/dtd/.',
      );
    }
  }

  // 2. Regional-backbone href resolution, relative to each backbone's own dir.
  for (const regionalFile of fileNames.filter((f) => REGIONAL_BACKBONE_RE.test(f))) {
    const regionalContent = await zip.file(regionalFile)!.async('string');
    const baseDir = path.posix.dirname(regionalFile);
    for (const match of regionalContent.match(/xlink:href="([^"]+)"/g) || []) {
      const href = match.replace('xlink:href="', '').replace(/"$/, '');
      const resolved = path.posix.normalize(path.posix.join(baseDir, href));
      if (!fileNames.includes(resolved)) {
        errors.push(
          `${regionalFile} references file "${href}" (resolves to "${resolved}") which is not present in the package`,
        );
      }
    }
  }

  // 3. Module folder structure.
  for (const folder of ['m1', 'm2', 'm3', 'm4', 'm5']) {
    if (!fileNames.some((f) => f.startsWith(`${folder}/`))) {
      warnings.push(`Module folder "${folder}/" is empty or missing`);
    }
  }

  // 4. A regional backbone exists under m1/.
  if (!fileNames.some((f) => REGIONAL_BACKBONE_RE.test(f))) {
    warnings.push(
      'No regional XML file found in m1/ (expected e.g. m1/us/us-regional.xml, m1/eu/eu-regional.xml, or m1/jp/jp-regional.xml)',
    );
  }

  // 5. Every other XML file in the package is well-formed.
  for (const xmlFile of fileNames.filter((f) => f.endsWith('.xml') && f !== 'index.xml')) {
    try {
      const content = await zip.file(xmlFile)!.async('string');
      errors.push(...validateXmlWellFormedness(content).map((e) => `${xmlFile}: ${e}`));
    } catch (e: any) {
      errors.push(`${xmlFile}: Could not read file — ${e.message}`);
    }
  }

  // 6. Reopen-and-verify the MD5 integrity manifest (the eCTD checksum
  //    contract). Every `md5  relPath` line must name a real entry whose bytes
  //    hash to the recorded value.
  if (!fileNames.includes('util/index-md5.txt')) {
    warnings.push('Missing util/index-md5.txt (MD5 integrity manifest)');
  } else {
    const manifest = await zip.file('util/index-md5.txt')!.async('string');
    for (const line of manifest.split('\n').map((l) => l.trimEnd()).filter(Boolean)) {
      const sep = line.indexOf('  ');
      if (sep <= 0) {
        errors.push(`util/index-md5.txt: malformed line "${line}"`);
        continue;
      }
      const recordedMd5 = line.slice(0, sep).trim();
      const relPath = line.slice(sep + 2).trim();
      const entry = zip.file(relPath);
      if (!entry) {
        errors.push(`util/index-md5.txt references file "${relPath}" which is not present in the package`);
        continue;
      }
      const actual = createHash('md5').update(await entry.async('nodebuffer')).digest('hex');
      if (actual !== recordedMd5) {
        errors.push(
          `util/index-md5.txt checksum mismatch for "${relPath}": recorded ${recordedMd5}, actual ${actual}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
