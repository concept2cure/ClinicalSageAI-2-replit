/**
 * Regional eCTD packager — wraps a package of CTD leaves into the
 * folder structure + backbone XML that each region requires.
 *
 * What's the same across FDA / EMA / PMDA:
 *   - Module 2–5 folder layout (ICH M4)
 *   - Standard MD5 hash file (util/index-md5.txt)
 *   - util/dtd/ for shared eCTD DTDs
 *
 * What differs:
 *   - Module 1 layout (m1/us/, m1/eu/, m1/jp/)
 *   - Regional backbone XML (us-regional.xml / eu-regional.xml / jp-regional.xml)
 *     each with different element names + required attributes
 *   - Module 1 envelope leaf (FDA: 1-1, EMA: 1.0.x, PMDA: 1.13)
 *   - Character encoding rules (FDA + EMA: UTF-8; PMDA: UTF-8 but allows
 *     Shift-JIS in legacy paths)
 *
 * This file produces the correct backbone + folder skeleton; it does NOT
 * generate Module 2–5 content (that comes from the platform's authoring
 * pipeline). Callers pass a `LeafIndex` mapping CTD section codes to file
 * paths and the packager assembles the zip with one m1 backbone per
 * region.
 *
 * Validator integration: pre-transmit validation is run by the per-gateway
 * service (FDA eValidator, EMA-validator, PMDA pre-check). The packager
 * surfaces the backbone path so the validator can target it directly.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import type { Region, SubmissionFormat, SubmissionBundle } from './types';
import { ValidationError } from './types';
import { finalizePdfA } from '../ectd/pdfa-pipeline';
import {
  evaluateSubmissionGrade,
  pdfaRequiredFromEnv,
  type LeafGradeRecord,
} from '../ectd/pdfa-readiness';
import {
  listVendoredDtds,
  assessDtdReadiness,
  dtdRequiredFromEnv,
  type DtdRegion,
} from '../ectd/dtd-bundler';

/**
 * Finalize a leaf's bytes to submission grade before they are written + hashed.
 * PDFs are run through the PDF/A-1b pipeline (a no-op when Ghostscript/veraPDF
 * are absent, so behaviour is unchanged in environments without the binaries).
 * When the bytes are actually converted the MD5 MUST be recomputed from the
 * converted bytes — the eCTD checksum contract requires index-md5 to match the
 * file that ships in the package — so any pre-computed leaf.md5 is dropped.
 *
 * Returns the conversion outcome alongside the bytes so the packager can build
 * the submission-grade roll-up and enforce the PDF/A gate (audit gap P0-2).
 */
async function finalizeLeafBytes(
  buf: Buffer,
  fileName: string,
): Promise<{ bytes: Buffer; md5Override?: string; isPdf: boolean; converted: boolean }> {
  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  if (!isPdf) return { bytes: buf, isPdf: false, converted: false };
  const result = await finalizePdfA(buf);
  if (!result.converted) return { bytes: buf, isPdf: true, converted: false };
  const bytes = Buffer.from(result.pdfBytes);
  return { bytes, md5Override: createHash('md5').update(bytes).digest('hex'), isPdf: true, converted: true };
}

/** One leaf in the eCTD index — corresponds to one file under one CTD section. */
export interface EctdLeaf {
  /** CTD section code, e.g. '1.1', '2.5', '3.2.S.1.1', '5.3.5.1'. */
  ctdSection: string;
  /** Operation per ICH M2: 'new' | 'append' | 'replace' | 'delete'. */
  operation: 'new' | 'append' | 'replace' | 'delete';
  /** Absolute path to the leaf file on disk. */
  sourcePath: string;
  /** Output filename inside the package (e.g. 'cover-letter.pdf'). */
  fileName: string;
  /** Display title for the leaf in the backbone. */
  title: string;
  /** Optional pre-computed checksum; computed if absent. */
  md5?: string;
}

export interface PackagerInput {
  region: Region;
  /** Application id — e.g. IND/NDA number for FDA, EU Procedure number for
   *  EMA, JP Application number for PMDA. */
  applicationId: string;
  /** Submission sequence number, four-digit zero-padded. */
  sequence: string;          // e.g. '0001'
  /** Submission type: 'original' | 'amendment' | 'response' | etc. */
  submissionType: string;
  /** Sponsor identifier — DUNS for FDA, EMA org id, PMDA applicant id. */
  sponsorId: string;
  /** Human-readable sponsor name. */
  sponsorName: string;
  /** Product / device name. */
  productName: string;
  /** All leaves to include. */
  leaves: EctdLeaf[];
  /** Output directory; the package zip is written here. */
  outputDir: string;
  /** Whether to also write the unzipped tree alongside the zip (useful
   *  for validator runs that need to walk the folder structure). */
  emitUnzipped?: boolean;
  /** Submission environment for the PDF/A gate. 'production' (the default)
   *  enforces PDF/A when ECTD_REQUIRE_PDFA=true; 'staging' never blocks. */
  environment?: 'staging' | 'production';
}

/** Compute MD5 of a file on disk. */
async function md5File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash('md5').update(buf).digest('hex');
}

/* ─── Region-specific backbone builders ───────────────────────────── */

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Build leaf elements common to all regions. */
function leafElement(leaf: EctdLeaf, sectionHref: string, id: string): string {
  return `<leaf operation="${leaf.operation}" xlink:href="${escapeXml(sectionHref)}/${escapeXml(leaf.fileName)}" ID="${escapeXml(id)}">
  <title>${escapeXml(leaf.title)}</title>
</leaf>`;
}

/** A valid XML ID fragment from a filename: drop extension, non-alnum → '-'. */
export function leafIdSlug(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'file'
  );
}

/**
 * Create a leaf-ID assigner scoped to a single backbone document.
 *
 * eCTD leaf IDs are XML ID-typed and must be unique within their document. The
 * CTD section alone is NOT unique — a section commonly holds several leaves
 * (e.g. multiple study reports in 5.3.5.1, multiple stability batches), and
 * `leaf-5-3-5-1` for all of them is invalid XML. Each ID is therefore based on
 * the section plus a filename slug, with a deterministic numeric suffix on the
 * (rare) remaining collision. One assigner per document, so IDs are unique
 * within — but may repeat across — separate backbones.
 */
export function createLeafIdAssigner(): (leaf: EctdLeaf) => string {
  const used = new Set<string>();
  return (leaf: EctdLeaf): string => {
    const base = `leaf-${leaf.ctdSection.replace(/\./g, '-')}-${leafIdSlug(leaf.fileName)}`;
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
}

/**
 * FDA us-regional.xml backbone. Per FDA eCTD Technical Conformance
 * Guide (current as of 2024). Module 1 sits under m1/us/.
 */
function buildFdaBackbone(input: PackagerInput): string {
  const assignId = createLeafIdAssigner();
  const m1Leaves = input.leaves
    .filter((l) => l.ctdSection.startsWith('1'))
    .map((l) => leafElement(l, `m1/us/${l.ctdSection.replace(/\./g, '-')}`, assignId(l)))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE us-regional SYSTEM "../util/dtd/us-regional-v2-01.dtd">
<us-regional xmlns:xlink="http://www.w3.org/1999/xlink"
             dtd-version="2.01"
             xmlns="urn:hl7-org:v3">
  <admin>
    <application-set>
      <application>
        <application-information>
          <application-number>${escapeXml(input.applicationId)}</application-number>
          <application-type>${escapeXml(input.submissionType)}</application-type>
        </application-information>
      </application>
    </application-set>
    <applicant-info>
      <id>${escapeXml(input.sponsorId)}</id>
      <name>${escapeXml(input.sponsorName)}</name>
    </applicant-info>
    <submission>
      <submission-id>${escapeXml(input.sequence)}</submission-id>
      <submission-type>${escapeXml(input.submissionType)}</submission-type>
      <submission-description>${escapeXml(input.productName)} — ${escapeXml(input.submissionType)} sequence ${escapeXml(input.sequence)}</submission-description>
    </submission>
  </admin>
  <m1-us>
${m1Leaves}
  </m1-us>
</us-regional>`;
}

/**
 * EMA eu-regional.xml backbone. Per EMA EU eCTD Specification v3.0.
 * Module 1 sits under m1/eu/ with eu-regional.xml at the m1/eu/ root.
 */
function buildEmaBackbone(input: PackagerInput): string {
  const assignId = createLeafIdAssigner();
  const m1Leaves = input.leaves
    .filter((l) => l.ctdSection.startsWith('1'))
    .map((l) => leafElement(l, `m1/eu/${l.ctdSection.replace(/\./g, '-')}`, assignId(l)))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE eu-regional SYSTEM "../util/dtd/eu-regional.dtd">
<eu-regional xmlns:xlink="http://www.w3.org/1999/xlink"
             dtd-version="3.0">
  <admin>
    <procedure>
      <procedure-number>${escapeXml(input.applicationId)}</procedure-number>
      <procedure-type>${escapeXml(input.submissionType)}</procedure-type>
    </procedure>
    <applicant>
      <id>${escapeXml(input.sponsorId)}</id>
      <name>${escapeXml(input.sponsorName)}</name>
    </applicant>
    <submission>
      <sequence>${escapeXml(input.sequence)}</sequence>
      <submission-unit>${escapeXml(input.submissionType)}</submission-unit>
      <related-sequence/>
    </submission>
  </admin>
  <m1-eu>
${m1Leaves}
  </m1-eu>
</eu-regional>`;
}

/**
 * PMDA jp-regional.xml backbone. Per PMDA "Notification on Electronic
 * Common Technical Document" (initial 2016, updated 2021). Module 1
 * sits under m1/jp/ with multi-byte titles permitted.
 */
function buildPmdaBackbone(input: PackagerInput): string {
  const assignId = createLeafIdAssigner();
  const m1Leaves = input.leaves
    .filter((l) => l.ctdSection.startsWith('1'))
    .map((l) => leafElement(l, `m1/jp/${l.ctdSection.replace(/\./g, '-')}`, assignId(l)))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE jp-regional SYSTEM "../util/dtd/jp-regional.dtd">
<jp-regional xmlns:xlink="http://www.w3.org/1999/xlink"
             dtd-version="1.0">
  <admin>
    <application>
      <application-number>${escapeXml(input.applicationId)}</application-number>
      <application-type>${escapeXml(input.submissionType)}</application-type>
    </application>
    <applicant>
      <pmda-applicant-id>${escapeXml(input.sponsorId)}</pmda-applicant-id>
      <name>${escapeXml(input.sponsorName)}</name>
    </applicant>
    <submission>
      <sequence-number>${escapeXml(input.sequence)}</sequence-number>
      <submission-type>${escapeXml(input.submissionType)}</submission-type>
      <product-name>${escapeXml(input.productName)}</product-name>
    </submission>
  </admin>
  <m1-jp>
${m1Leaves}
  </m1-jp>
</jp-regional>`;
}

/**
 * Health Canada ca-regional.xml backbone. Per the Health Canada "Guidance
 * Document: Preparation of Regulatory Activities in the eCTD Format" and the
 * CA Module 1 specification. Module 1 sits under m1/ca/ with the regional
 * backbone at m1/ca/ca-regional.xml. Transmission is via the Common
 * Electronic Submissions Gateway (CESG).
 */
function buildHcBackbone(input: PackagerInput): string {
  const assignId = createLeafIdAssigner();
  const m1Leaves = input.leaves
    .filter((l) => l.ctdSection.startsWith('1'))
    .map((l) => leafElement(l, `m1/ca/${l.ctdSection.replace(/\./g, '-')}`, assignId(l)))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ca-regional SYSTEM "../util/dtd/ca-regional.dtd">
<ca-regional xmlns:xlink="http://www.w3.org/1999/xlink"
             dtd-version="3.0">
  <admin>
    <application>
      <dossier-id>${escapeXml(input.applicationId)}</dossier-id>
      <regulatory-activity-type>${escapeXml(input.submissionType)}</regulatory-activity-type>
    </application>
    <applicant>
      <company-name>${escapeXml(input.sponsorName)}</company-name>
      <company-id>${escapeXml(input.sponsorId)}</company-id>
    </applicant>
    <submission>
      <sequence-number>${escapeXml(input.sequence)}</sequence-number>
      <submission-type>${escapeXml(input.submissionType)}</submission-type>
      <product-name>${escapeXml(input.productName)}</product-name>
    </submission>
  </admin>
  <m1-ca>
${m1Leaves}
  </m1-ca>
</ca-regional>`;
}

/* ─── M2-M5 common backbone (ICH M8) ──────────────────────────────── */

function buildIndexXml(input: PackagerInput, m2to5: EctdLeaf[]): string {
  // One assigner for the whole index.xml document (all of m2–m5 live here).
  const assignId = createLeafIdAssigner();
  const grouped: Record<string, EctdLeaf[]> = { m2: [], m3: [], m4: [], m5: [] };
  for (const leaf of m2to5) {
    const mod = `m${leaf.ctdSection.charAt(0)}`;
    if (grouped[mod]) grouped[mod].push(leaf);
  }
  const moduleBlocks = (['m2', 'm3', 'm4', 'm5'] as const).map((m) => {
    const leaves = grouped[m]
      .map((l) => leafElement(l, `${m}/${l.ctdSection.replace(/\./g, '-')}`, assignId(l)))
      .join('\n');
    return `  <${m}>\n${leaves}\n  </${m}>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd"
           xmlns:xlink="http://www.w3.org/1999/xlink"
           dtd-version="3.2">
${moduleBlocks}
</ectd:ectd>`;
}

/* ─── index-md5.txt (one MD5 per file, sorted) ────────────────────── */

interface ChecksumEntry { relPath: string; md5: string; }
export function buildMd5Index(entries: ChecksumEntry[]): string {
  return entries
    .slice()
    // Codepoint order, not localeCompare: the manifest must be byte-identical
    // across environments (the checksum contract), and locale collation is
    // locale/ICU-dependent.
    .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
    .map((e) => `${e.md5}  ${e.relPath}`)
    .join('\n');
}

/* ─── Top-level packager ──────────────────────────────────────────── */

export async function packageEctdSubmission(input: PackagerInput): Promise<SubmissionBundle> {
  const region = input.region;
  const backboneByRegion: Record<Region, () => string> = {
    fda:  () => buildFdaBackbone(input),
    ema:  () => buildEmaBackbone(input),
    pmda: () => buildPmdaBackbone(input),
    ca:   () => buildHcBackbone(input),
  };
  const m1FolderByRegion: Record<Region, string> = {
    fda:  'm1/us',
    ema:  'm1/eu',
    pmda: 'm1/jp',
    ca:   'm1/ca',
  };
  const backboneFileByRegion: Record<Region, string> = {
    fda:  `${m1FolderByRegion.fda}/us-regional.xml`,
    ema:  `${m1FolderByRegion.ema}/eu-regional.xml`,
    pmda: `${m1FolderByRegion.pmda}/jp-regional.xml`,
    ca:   `${m1FolderByRegion.ca}/ca-regional.xml`,
  };

  const zip = new JSZip();
  const checksums: ChecksumEntry[] = [];
  const grades: LeafGradeRecord[] = [];

  /* Write regional Module 1 backbone. */
  const regionalXml = backboneByRegion[region]();
  const regionalPath = backboneFileByRegion[region];
  zip.file(regionalPath, regionalXml);
  checksums.push({
    relPath: regionalPath,
    md5: createHash('md5').update(regionalXml).digest('hex'),
  });

  /* Write Module 1 leaves under the region-specific folder. */
  const m1Leaves = input.leaves.filter((l) => l.ctdSection.startsWith('1'));
  for (const leaf of m1Leaves) {
    const raw = await fs.readFile(leaf.sourcePath);
    const { bytes, md5Override, isPdf, converted } = await finalizeLeafBytes(raw, leaf.fileName);
    grades.push({ fileName: leaf.fileName, isPdf, converted });
    const targetPath = `${m1FolderByRegion[region]}/${leaf.ctdSection.replace(/\./g, '-')}/${leaf.fileName}`;
    zip.file(targetPath, bytes);
    checksums.push({
      relPath: targetPath,
      md5: md5Override ?? leaf.md5 ?? createHash('md5').update(bytes).digest('hex'),
    });
  }

  /* Write Module 2–5 leaves under shared folders. */
  const m2to5 = input.leaves.filter((l) => !l.ctdSection.startsWith('1'));
  for (const leaf of m2to5) {
    const mod = `m${leaf.ctdSection.charAt(0)}`;
    const raw = await fs.readFile(leaf.sourcePath);
    const { bytes, md5Override, isPdf, converted } = await finalizeLeafBytes(raw, leaf.fileName);
    grades.push({ fileName: leaf.fileName, isPdf, converted });
    const targetPath = `${mod}/${leaf.ctdSection.replace(/\./g, '-')}/${leaf.fileName}`;
    zip.file(targetPath, bytes);
    checksums.push({
      relPath: targetPath,
      md5: md5Override ?? leaf.md5 ?? createHash('md5').update(bytes).digest('hex'),
    });
  }

  /* PDF/A submission-grade gate (audit gap P0-2): when ECTD_REQUIRE_PDFA=true
     and this is a production package, refuse to ship any PDF leaf that the
     PDF/A pipeline could not convert (e.g. Ghostscript missing). Default
     (flag unset) is report-only, preserving graceful degradation. */
  const gradeGate = evaluateSubmissionGrade({
    leaves: grades,
    environment: input.environment ?? 'production',
    requirePdfA: pdfaRequiredFromEnv(),
  });
  if (!gradeGate.cleared) {
    throw new ValidationError(
      `eCTD package is not submission-grade: ${gradeGate.blockers.join(' ')}`,
      gradeGate.blockers,
    );
  }
  const submissionGrade = gradeGate.summary;

  /* Bundle vendored DTDs into util/dtd/ so the package is DTD self-contained
     (the backbones' DOCTYPEs reference util/dtd/*.dtd). The licensed DTD files
     are not committed — they come from assets/ectd-dtd/ or $ECTD_DTD_DIR — so
     this is a no-op when absent. DTDs are package files, so they are checksummed
     into index-md5.txt alongside the leaves. */
  const vendoredDtds = await listVendoredDtds();
  for (const dtd of vendoredDtds) {
    const relPath = `util/dtd/${dtd.fileName}`;
    zip.file(relPath, dtd.bytes);
    checksums.push({ relPath, md5: createHash('md5').update(dtd.bytes).digest('hex') });
  }

  /* DTD self-containment gate (audit gap P0-1): when ECTD_REQUIRE_DTD=true and
     this is a production package, refuse to ship a package that references DTDs
     it does not contain. Default (flag unset) is report-only. */
  const dtdGate = assessDtdReadiness({
    region: region as DtdRegion,
    present: vendoredDtds.map((d) => d.fileName),
    environment: input.environment ?? 'production',
    requireDtd: dtdRequiredFromEnv(),
  });
  if (!dtdGate.cleared) {
    throw new ValidationError(
      `eCTD package is not DTD self-contained: ${dtdGate.blockers.join(' ')}`,
      dtdGate.blockers,
    );
  }

  /* Write the ICH M2-M5 index.xml + index-md5.txt. */
  const indexXml = buildIndexXml(input, m2to5);
  zip.file('index.xml', indexXml);
  checksums.push({ relPath: 'index.xml', md5: createHash('md5').update(indexXml).digest('hex') });

  zip.file('util/index-md5.txt', buildMd5Index(checksums));

  /* Generate the zip + write to disk. */
  await fs.mkdir(input.outputDir, { recursive: true });
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const filename = `${input.applicationId}-${input.sequence}-${region}.zip`;
  const outPath = path.join(input.outputDir, filename);
  await fs.writeFile(outPath, buffer);

  const format: SubmissionFormat = region === 'pmda' ? 'pmda_ectd' : 'ectd';

  /* Optionally extract for validator runs. */
  if (input.emitUnzipped) {
    const extractDir = path.join(input.outputDir, `${input.applicationId}-${input.sequence}-${region}`);
    await fs.mkdir(extractDir, { recursive: true });
    for (const [relPath, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const dest = path.join(extractDir, relPath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      const content = await (file as JSZip.JSZipObject).async('nodebuffer');
      await fs.writeFile(dest, content);
    }
  }

  return {
    path:      outPath,
    sha256:    createHash('sha256').update(buffer).digest('hex'),
    sizeBytes: buffer.length,
    format,
    displayName: `${input.productName} · ${region.toUpperCase()} ${input.submissionType} #${input.sequence}`,
    submissionGrade,
    dtdStatus: {
      required: dtdGate.required,
      present: dtdGate.present,
      missing: dtdGate.missing,
      selfContained: dtdGate.selfContained,
    },
  };
}
