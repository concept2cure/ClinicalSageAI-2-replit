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
 *     backbone), module folder presence, DTD self-containment, the eCTD
 *     checksum contract (index-md5.txt at the sequence root = MD5 of index.xml,
 *     and every leaf's md5 checksum in index.xml and each regional backbone),
 *     and a reopen-and-verify of util/index-md5.txt, the platform's own
 *     whole-package manifest (not an ICH file).
 *     Ported here from the retired `ectdExportService` so ZIP-level structural
 *     validation has exactly one implementation, colocated with the canonical
 *     packager whose output it checks.
 *
 * Both apply the region's eCTD file rules — file and folder names, path length,
 * PDF version — with the limits taken from the region's market specification
 * (market-specs/market-submission-specs.ts), not restated here.
 *
 * 2026-10-08 (W5/D7, sweeps VP-3, VP-4, VP-7): the ZIP validator called
 * util/index-md5.txt "the eCTD checksum contract" and read nothing else, so a
 * wrong or missing root index-md5.txt and a wrong leaf checksum were reported
 * valid; only the base file name was tested, and loosely; the PDF version was
 * never read, so PDF 1.3 leaves passed both validators.
 */

import JSZip from 'jszip';
import { assertZipWithinLimits } from '../archive/safeZip';
import * as path from 'path';
import { createHash } from 'crypto';
import { FILENAME_PATTERN, FILENAME_RULE_TEXT, FOLDER_NAME_PATTERN } from '../ectd/ectd-regional-rules';
import { classifyPdfA, isPdfLeaf } from '../ectd/pdfa-detect';
import { getMarketSpec, type MarketSubmissionSpec } from '../market-specs/market-submission-specs';
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';

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

/**
 * The eCTD market specification for a region named in any of the platform's
 * vocabularies ('FDA', 'fda', 'US', 'EMA', 'eu' …), or undefined when none is
 * recorded for it. Its `formatting` carries the region's PDF versions and path
 * cap; nothing here restates them.
 */
function ectdSpecFor(region: string | undefined): MarketSubmissionSpec | undefined {
  const code = canonicalRegionOf(region);
  return code ? getMarketSpec(`${code.toLowerCase()}-ectd`) : undefined;
}

interface PathProblem {
  ruleId: 'LEAF-FILENAME' | 'LEAF-PATH-LENGTH';
  message: string;
}

/**
 * The eCTD naming rules on one package-relative path (ICH eCTD v3.2.2 Appendix
 * 2): the file name, every folder above it, and — when the region records a cap
 * — the length of the whole path.
 */
function ectdPathProblems(filePath: string, spec: MarketSubmissionSpec | undefined): PathProblem[] {
  const problems: PathProblem[] = [];
  const folders = filePath.split('/');
  const baseName = folders.pop() ?? '';
  if (!FILENAME_PATTERN.test(baseName)) {
    problems.push({
      ruleId: 'LEAF-FILENAME',
      message: `File name '${baseName}' breaks the eCTD file-name rule (${FILENAME_RULE_TEXT}).`,
    });
  }
  for (const folder of folders) {
    if (!FOLDER_NAME_PATTERN.test(folder)) {
      problems.push({
        ruleId: 'LEAF-FILENAME',
        message: `Folder '${folder}' in ${filePath} breaks the eCTD folder-name rule (lowercase a-z, 0-9 and '-'; at most 64 characters).`,
      });
    }
  }
  const cap = spec?.formatting.maxPathLength;
  if (cap !== undefined && filePath.length > cap) {
    problems.push({
      ruleId: 'LEAF-PATH-LENGTH',
      message: `Path ${filePath} is ${filePath.length} characters; ${spec!.authority} allows at most ${cap}.`,
    });
  }
  return problems;
}

/**
 * LEAF-PDF-VERSION: the version in a PDF's header (read by pdfa-detect, the
 * one parse of it) against the region's accepted versions. Null when it is
 * inside them, or when the region records none. A header naming no version is
 * not shown to be inside the range, so it is reported too.
 */
function pdfVersionProblem(bytes: Buffer, spec: MarketSubmissionSpec | undefined): string | null {
  const accepted = spec?.formatting.pdfVersions ?? [];
  if (accepted.length === 0) return null;
  const range = accepted.length > 1 ? `${accepted[0]}–${accepted[accepted.length - 1]}` : accepted[0];
  const version = classifyPdfA(bytes).pdfVersion;
  if (version !== null && accepted.includes(version)) return null;
  return version !== null
    ? `PDF version ${version} is outside the ${spec!.authority} accepted range (PDF ${range}).`
    : `The PDF header names no version, so it is not shown to be inside the ${spec!.authority} accepted range (PDF ${range}).`;
}

interface EctdLeaf {
  path: string;
  mediaType: string;
  content: Buffer;
}

/**
 * What a leaf's bytes say, as at most one error: LEAF-MEDIATYPE (every leaf is
 * a PDF), LEAF-CORRUPT (a PDF begins with the %PDF- magic bytes), then
 * LEAF-PDF-VERSION against the region's accepted versions (`spec`; none for a
 * non-eCTD bundle). The version is read from the bytes as assembled: the PDF/A
 * conversion that may follow always writes 1.4, and every way it can fail
 * ships these bytes unchanged.
 */
function leafContentFinding(leaf: EctdLeaf, spec: MarketSubmissionSpec | undefined): EctdFinding | null {
  if (leaf.mediaType !== 'application/pdf') {
    return {
      severity: 'error',
      ruleId: 'LEAF-MEDIATYPE',
      message: `Leaf media type must be application/pdf, got ${leaf.mediaType}.`,
      filePath: leaf.path,
    };
  }
  if (!(leaf.content && leaf.content.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC))) {
    return {
      severity: 'error',
      ruleId: 'LEAF-CORRUPT',
      message: 'PDF leaf does not begin with the %PDF- magic bytes (corrupt or non-PDF content).',
      filePath: leaf.path,
    };
  }
  const version = pdfVersionProblem(leaf.content, spec);
  return version
    ? {
        severity: 'error',
        ruleId: 'LEAF-PDF-VERSION',
        message: `${version} Save the document in an accepted version (or as PDF/A-1 or PDF/A-2), add that version, and assemble again.`,
        filePath: leaf.path,
      }
    : null;
}

/**
 * Validate a set of eCTD leafs. Deterministic, in-memory, no XML parsing.
 *
 * @param leafs The assembled leafs (path, mediaType, PDF content buffer).
 * @param opts.region eCTD region (informational; reserved for region rules).
 * @param opts.emptyLeafPaths Paths the caller already flagged empty (in addition
 *        to leafs whose content begins with the `[EMPTY SECTION]` marker).
 * @param opts.enforceFileNames Apply the eCTD leaf rules as ERRORS: the file
 *        and folder names (FILENAME_PATTERN, FOLDER_NAME_PATTERN), the path
 *        length and the PDF version, the last two from the region's eCTD market
 *        specification. Set for eCTD bundles; a device form (eSTAR / EUDAMED) is
 *        not an eCTD leaf and is not subject to them.
 */
export function validateEctdLeafs(
  leafs: EctdLeaf[],
  opts: {
    region: string;
    emptyLeafPaths?: string[];
    /** Sections that ship no leaf because nothing is mapped to them (eCTD, since
     *  2026-10-01, sweep F11: an empty section files nothing rather than a
     *  placeholder leaf). Counted in the summary, which would otherwise report
     *  0 empty sections for a package that has some. */
    emptySectionsFilingNothing?: number;
    enforceFileNames?: boolean;
  },
): EctdValidationResult {
  const findings: EctdFinding[] = [];
  const emptySet = new Set(opts.emptyLeafPaths ?? []);
  const ectdRules = opts.enforceFileNames === true;
  const spec = ectdRules ? ectdSpecFor(opts.region) : undefined;
  if (ectdRules && !spec) {
    findings.push({
      severity: 'warning',
      ruleId: 'REGION-SPEC-MISSING',
      message: `No eCTD market specification is recorded for region ${opts.region}, so PDF versions and path lengths were not checked.`,
    });
  }

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

    const content = leafContentFinding(leaf, spec);
    if (content) findings.push(content);

    // LEAF-FILENAME / LEAF-PATH-LENGTH: the eCTD naming rules the regional
    // validator treats as blocking (EMA-CESP-005), on the file name, every
    // folder and the path's length. Nothing on the assemble/transmit path
    // applied them before, so a long section key shipped an 84-character leaf
    // name with a clean gate.
    if (ectdRules) {
      for (const p of ectdPathProblems(leaf.path, spec)) {
        findings.push({ severity: 'error', ruleId: p.ruleId, message: p.message, filePath: leaf.path });
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
    message: `${leafs.length} leaf(s), ${emptyLeafCount + (opts.emptySectionsFilingNothing ?? 0)} empty section(s), region ${opts.region}.`,
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
const REGIONAL_BACKBONE_RE = /^m1\/(?:[a-z]{2}\/)?([a-z]{2})-regional\.xml$/;

const NO_REGION_WARNING =
  'The package does not name one region through a regional Module 1 backbone, so PDF versions and path lengths were not checked.';

/** The region a package names through its regional backbone(s) — only when
 *  they name exactly one. */
function packageRegion(fileNames: string[]): string | undefined {
  const codes = new Set(fileNames.map((f) => REGIONAL_BACKBONE_RE.exec(f)?.[1]).filter((c): c is string => !!c));
  return codes.size === 1 ? [...codes][0] : undefined;
}

/**
 * One pass over the package's entries: the MD5 of each (which every checksum
 * check reads, so no entry is decompressed twice) and LEAF-PDF-VERSION on each
 * PDF.
 */
async function digestEntries(
  zip: JSZip,
  fileNames: string[],
  spec: MarketSubmissionSpec | undefined,
): Promise<{ md5Of: Map<string, string>; errors: string[] }> {
  const md5Of = new Map<string, string>();
  const errors: string[] = [];
  for (const f of fileNames) {
    let bytes: Buffer;
    try {
      bytes = await zip.file(f)!.async('nodebuffer');
    } catch (e: any) {
      errors.push(`${f}: Could not read file — ${e.message}`);
      continue;
    }
    md5Of.set(f, createHash('md5').update(bytes).digest('hex'));
    const version = isPdfLeaf(f, bytes) ? pdfVersionProblem(bytes, spec) : null;
    if (version) errors.push(`${f}: ${version}`);
  }
  return { md5Of, errors };
}

/** <leaf> start tags, namespace-prefixed or not. */
const LEAF_TAG_RE = /<(?:[A-Za-z_][\w.-]*:)?leaf(?=[\s/>])[^>]*>/g;

function xmlAttr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? (m[1] ?? m[2]) : undefined;
}

/**
 * The eCTD checksum contract, per leaf: every <leaf> that names a file (a
 * delete names none) carries an md5 `checksum` equal to the MD5 of that file,
 * its href resolved against `baseDir` (the backbone's own folder; '' for
 * index.xml, whose hrefs are root-relative). A file the package does not hold
 * is reported by the href checks, not again here.
 */
function leafChecksumErrors(backbone: string, xml: string, baseDir: string, md5Of: Map<string, string>): string[] {
  const errors: string[] = [];
  for (const tag of xml.replace(/<!--[\s\S]*?-->/g, '').match(LEAF_TAG_RE) ?? []) {
    const href = xmlAttr(tag, 'xlink:href');
    if (!href) continue;
    const checksum = xmlAttr(tag, 'checksum');
    const type = xmlAttr(tag, 'checksum-type');
    const actual = md5Of.get(baseDir ? path.posix.normalize(path.posix.join(baseDir, href)) : href);
    if (!checksum) {
      errors.push(`${backbone}: the leaf for "${href}" carries no checksum.`);
    } else if (type?.toLowerCase() !== 'md5') {
      errors.push(`${backbone}: the leaf for "${href}" declares checksum-type "${type ?? ''}"; eCTD v3.2.2 requires md5.`);
    } else if (actual !== undefined && actual !== checksum.toLowerCase()) {
      errors.push(`${backbone}: checksum mismatch for "${href}": the leaf records ${checksum}, the file's MD5 is ${actual}.`);
    }
  }
  return errors;
}

/** The eCTD checksum contract, for the backbone: index-md5.txt at the sequence
 *  root holds the MD5 of index.xml's bytes (ICH eCTD v3.2.2). */
async function rootChecksumErrors(zip: JSZip, fileNames: string[], md5Of: Map<string, string>): Promise<string[]> {
  if (!fileNames.includes('index-md5.txt')) {
    return ['Missing required file: index-md5.txt (the MD5 of index.xml, ICH eCTD v3.2.2).'];
  }
  const recorded = (await zip.file('index-md5.txt')!.async('string')).trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(recorded)) {
    return ['index-md5.txt does not hold an MD5 checksum (32 hexadecimal characters) of index.xml.'];
  }
  const actual = md5Of.get('index.xml');
  return recorded === actual ? [] : [`index-md5.txt records ${recorded}, but the MD5 of index.xml is ${actual}.`];
}

/**
 * Validate an eCTD package ZIP buffer for structural correctness.
 *
 * Checks:
 *  - the region's file rules on every entry: file name, every folder name, and
 *    — with the region read from the regional backbone — path length and the
 *    version of every PDF (a warning says so when no single region is named);
 *  - required index.xml exists and is well-formed;
 *  - every xlink:href in index.xml resolves to a real ZIP entry (root-relative);
 *  - every xlink:href in each m1 regional backbone resolves relative to the
 *    backbone's own directory;
 *  - the eCTD checksum contract: index-md5.txt at the root holds the MD5 of
 *    index.xml, and every leaf in index.xml and each regional backbone carries
 *    the md5 checksum of the file it references (each an error);
 *  - module folders m1–m5 are present (warning when absent);
 *  - a regional backbone exists under m1/ (warning when absent);
 *  - every other XML file in the package is well-formed;
 *  - DTD self-containment: a DOCTYPE-referenced DTD must be bundled under
 *    util/dtd/ or the package is not self-contained (warning);
 *  - util/index-md5.txt — the platform's own whole-package manifest, not an
 *    ICH file — re-verifies against the actual ZIP bytes: a mismatch or a
 *    manifest entry naming a missing file is an error; a missing manifest is a
 *    warning.
 */
export async function validateEctdPackage(
  zipBuffer: Buffer,
  /** `platform-generated`: a package this server assembled, which no upload limit binds.
   *  Anything else is held to the one archive limit before it inflates (SEC-17), and an
   *  ArchiveLimitError reaches the caller, which answers 422. */
  opts: { origin?: 'upload' | 'platform-generated' } = {},
): Promise<EctdZipValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if ((opts.origin ?? 'upload') !== 'platform-generated') await assertZipWithinLimits(zipBuffer);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch (e: any) {
    return { valid: false, errors: [`Invalid ZIP archive: ${e.message}`], warnings: [] };
  }

  const fileNames = Object.keys(zip.files).filter((f) => !zip.files[f].dir);

  // The region's file rules on every packaged file: name, folders, path length
  // and PDF version. The assemble path composes names to them, but this
  // validator — the one the export route runs by default — checked only the
  // base name, so an over-long leaf name left with a clean gate.
  const spec = ectdSpecFor(packageRegion(fileNames));
  if (!spec) warnings.push(NO_REGION_WARNING);
  for (const f of fileNames) errors.push(...ectdPathProblems(f, spec).map((p) => p.message));
  const { md5Of, errors: entryErrors } = await digestEntries(zip, fileNames, spec);
  errors.push(...entryErrors);

  // 1. index.xml exists, is well-formed, its hrefs resolve, the root
  //    index-md5.txt holds its MD5, and each of its leaves its file's MD5.
  if (!fileNames.includes('index.xml')) {
    errors.push('Missing required file: index.xml (eCTD backbone)');
  } else {
    const indexContent = await zip.file('index.xml')!.async('string');
    errors.push(...validateXmlWellFormedness(indexContent).map((e) => `index.xml: ${e}`));
    errors.push(...(await rootChecksumErrors(zip, fileNames, md5Of)));
    errors.push(...leafChecksumErrors('index.xml', indexContent, '', md5Of));

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

    // Stylesheet self-containment: index.xml references a stylesheet via
    // <?xml-stylesheet?>; a submission-ready package must bundle it under
    // util/style/. eValidator flags a reference the package cannot resolve, and
    // the backbone will not open through the ICH stylesheet in a browser.
    const styleHref = /<\?xml-stylesheet[^>]*href="([^"]+)"/i.exec(indexContent)?.[1];
    const hasBundledStylesheet = fileNames.some((f) => f.startsWith('util/style/') && f.endsWith('.xsl'));
    if (styleHref && !hasBundledStylesheet) {
      warnings.push(
        `index.xml references stylesheet "${styleHref}" but no stylesheet is bundled under util/style/ — ` +
          'the package is not self-contained and is not submission-ready until the ICH/regional ' +
          'stylesheets are vendored into util/style/.',
      );
    }
  }

  // 2. Regional-backbone href resolution and leaf checksums, relative to each
  //    backbone's own dir.
  for (const regionalFile of fileNames.filter((f) => REGIONAL_BACKBONE_RE.test(f))) {
    const regionalContent = await zip.file(regionalFile)!.async('string');
    const baseDir = path.posix.dirname(regionalFile);
    errors.push(...leafChecksumErrors(regionalFile, regionalContent, baseDir, md5Of));
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

  // 6. Reopen-and-verify util/index-md5.txt, the platform's own whole-package
  //    manifest (the eCTD checksum contract is step 1 and 2's root file and
  //    leaf checksums; ICH's util/ holds only dtd/ and style/). Every
  //    `md5  relPath` line must name a real entry whose bytes hash to the
  //    recorded value.
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
      if (!zip.file(relPath)) {
        errors.push(`util/index-md5.txt references file "${relPath}" which is not present in the package`);
        continue;
      }
      // An entry that could not be read has no MD5 and is already an error.
      const actual = md5Of.get(relPath);
      if (actual !== undefined && actual !== recordedMd5) {
        errors.push(
          `util/index-md5.txt checksum mismatch for "${relPath}": recorded ${recordedMd5}, actual ${actual}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
