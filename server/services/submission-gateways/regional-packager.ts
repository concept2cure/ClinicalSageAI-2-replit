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
import { ValidationError, resolveToRegistryEntry, getSubmissionTypeLabel } from './types';

// Re-export the region taxonomy from this packager's public surface: callers
// that import `packageEctdSubmission` (e.g. the eCTD qualification subsystem)
// also need its `Region` type, and the packager is their entry point.
export type { Region } from './types';
import { finalizePdfA } from '../ectd/pdfa-pipeline';
import { classifyPdfA } from '../ectd/pdfa-detect';
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
import { classifyRegionalBackbone } from '../ectd/regional-backbone-readiness';
import {
  resolveApplicationTypeCode,
  resolveSubmissionTypeCode,
  resolveSubmissionSubTypeCode,
  resolveFormTypeCode,
  resolveContactTypeCode,
  usRegionalSectionElement,
} from '../ectd/controlled-vocab';
import { generateStfFiles, type StfLeaf, type StfStudyMeta } from '../ectd/stf-generator';
import {
  resolveCrossReferences,
  xrefRequiredFromEnv,
  type CrossReference,
} from '../ectd/cross-reference-resolver';

// Packager primitives, split into ./ectd-packager/* so the reusable pieces
// (types, leaf-id, md5-index, path helpers) live apart from this ~600-line
// orchestrator. This file stays the packager barrel: it imports them for its
// own use AND re-exports the public ones below, so every caller keeps its
// stable `../regional-packager` import path.
import type {
  EctdLeaf,
  FdaApplicantContact,
  FdaFormLeaf,
  FdaRegionalAdmin,
  LeafRef,
  ChecksumEntry,
} from './ectd-packager/types';
import { leafIdSlug, createLeafIdAssigner } from './ectd-packager/leaf-id';
import { buildMd5Index } from './ectd-packager/md5-index';
import { escapeXml, studyFolderSlug, commonDir } from './ectd-packager/paths';
import { buildIchModuleTree, findDroppedLeaves, type RenderedLeaf } from './ectd-packager/ich-headings';

// Re-export the public packager surface (barrel).
export type { EctdLeaf, FdaApplicantContact, FdaFormLeaf, FdaRegionalAdmin };
export { leafIdSlug, createLeafIdAssigner, buildMd5Index, studyFolderSlug, commonDir };

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
  skipPdfaConversion = false,
): Promise<{ bytes: Buffer; md5Override?: string; isPdf: boolean; converted: boolean; encrypted: boolean }> {
  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  if (!isPdf) return { bytes: buf, isPdf: false, converted: false, encrypted: false };
  // An /Encrypt dictionary is detected here on every path, including the
  // deterministic one that skips PDF/A. finalizePdfA used to note it only as
  // a warning string the packager then discarded, so a secured leaf shipped
  // indistinguishable from any other unconverted PDF.
  const encrypted = classifyPdfA(buf).encrypted;
  // Deterministic path: skip PDF/A normalization so the shipped bytes equal the
  // input bytes exactly. Used for validation-only assembly (e.g. the submission
  // orchestrator) where byte-determinism across re-renders matters more than
  // PDF/A-1b normalization — Ghostscript conversion embeds timestamps and is
  // non-deterministic, which would break a re-derive-and-compare drift check.
  if (skipPdfaConversion || encrypted) return { bytes: buf, isPdf: true, converted: false, encrypted };
  const result = await finalizePdfA(buf);
  if (!result.converted) return { bytes: buf, isPdf: true, converted: false, encrypted };
  const bytes = Buffer.from(result.pdfBytes);
  return { bytes, md5Override: createHash('md5').update(bytes).digest('hex'), isPdf: true, converted: true, encrypted };
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
  /**
   * Skip PDF/A-1b normalization so each leaf ships byte-identical to its source.
   * For validation-only assembly (e.g. the submission orchestrator) where
   * re-render byte-determinism matters more than PDF/A normalization: Ghostscript
   * conversion embeds timestamps and is non-deterministic, which would make a
   * re-derive-and-compare drift check false-positive. Default false (the real
   * deliverable path always normalizes to PDF/A).
   */
  skipPdfaConversion?: boolean;
  /** FDA us-regional admin metadata (only used when region === 'fda'). */
  fda?: FdaRegionalAdmin;
  /** Per-study metadata for the Study Tagging Files generated from study leaves. */
  studyMeta?: StfStudyMeta[];
  /**
   * Declared intra-package cross-references (hyperlinks between leaves/sections,
   * e.g. a 2.7.3 summary citing a 5.3.5.1 study report). Resolved at package
   * time; a broken (dangling / withdrawn-target) reference is surfaced on the
   * bundle and blocks a production build when ECTD_REQUIRE_XREF=true.
   */
  crossReferences?: CrossReference[];
}

/* ─── Region-specific backbone builders ───────────────────────────── */

/**
 * Build one `<leaf>` element with the full ICH attribute set: operation,
 * inline `checksum`/`checksum-type="md5"` (matching the shipped bytes), the
 * backbone-relative `xlink:href`, and — for a lifecycle operation — the
 * `modified-file` pointer at the superseded leaf.
 */
function leafElement(leaf: EctdLeaf, id: string, ref: LeafRef): string {
  const modified = leaf.modifiedFile ? ` modified-file="${escapeXml(leaf.modifiedFile)}"` : '';
  return `<leaf operation="${leaf.operation}"${modified} checksum="${ref.md5}" checksum-type="md5" xlink:href="${escapeXml(ref.href)}" xlink:type="simple" ID="${escapeXml(id)}">
  <title>${escapeXml(leaf.title)}</title>
</leaf>`;
}

/** Render the FDA applicant-contacts block from the admin metadata. */
function fdaContactsBlock(contacts: FdaApplicantContact[]): string {
  if (!contacts.length) return '      <applicant-info/>';
  const rows = contacts
    .map((c) => {
      const code = resolveContactTypeCode(c.type) ?? 'fdaact1';
      const telecom = [
        c.email ? `          <email>${escapeXml(c.email)}</email>` : '',
        c.phone ? `          <telephone>${escapeXml(c.phone)}</telephone>` : '',
      ].filter(Boolean).join('\n');
      return `        <applicant-contact>
          <applicant-contact-name applicant-contact-type="${code}">${escapeXml(c.name)}</applicant-contact-name>${telecom ? '\n' + telecom : ''}
        </applicant-contact>`;
    })
    .join('\n');
  return `      <applicant-info>
        <applicant-contacts>
${rows}
        </applicant-contacts>
      </applicant-info>`;
}

/** Render the `<form>` elements nested under submission-information. */
function fdaFormsBlock(forms: FdaFormLeaf[], resolve: (l: EctdLeaf) => LeafRef): string {
  const assignId = createLeafIdAssigner();
  return forms
    .map((f) => {
      const code = resolveFormTypeCode(f.formType) ?? 'fdaft2';
      return `          <form form-type="${code}">
${leafElement(f.leaf, assignId(f.leaf), resolve(f.leaf)).split('\n').map((l) => '            ' + l).join('\n')}
          </form>`;
    })
    .join('\n');
}

/**
 * FDA us-regional.xml backbone — conformant with the FDA eCTD Backbone Files
 * Specification for Module 1 (DTD version 3.3). Module 1 sits under m1/us/;
 * the backbone declares `xmlns:fda-regional="http://www.ich.org/fda"`, carries
 * the coded admin block (application-type / submission-type / submission-sub-
 * type / form-type as `fdaXX` attributes), and nests content leaves under
 * FDA-published section heading elements (e.g. `<m1-2-cover-letters>`).
 *
 * DTD path: the regional backbone is written two levels deep (m1/<cc>/<cc>-regional.xml)
 * while the vendored DTDs are bundled at the sequence root (util/dtd/), so the
 * DOCTYPE must climb two levels (`../../util/dtd/…`) — the form FDA's own example
 * us-regional.xml uses. A single `../` resolved to m1/util/dtd/, which no package
 * contains, so every regional backbone was un-validatable the moment a DTD was
 * dropped in. Pinned by __tests__/regional-backbone-dtd-path.test.ts.
 */
function buildFdaBackbone(input: PackagerInput, resolve: (l: EctdLeaf) => LeafRef): string {
  const fda = input.fda ?? {};
  /* Filing identity fails closed, and neither attribute is resolved through the
     other's vocabulary.

     Two callers disagree about what `input.submissionType` holds. The interface
     documents a SUBMISSION type ('original' | 'amendment' | ...), which is what
     most callers pass; orchestrator-real-package.ts passes an APPLICATION type
     ('IND' | 'NDA' | '510k' | ...). The old code fed that one field into BOTH
     vocabularies, so each caller hit the other's failure:

       - `resolveApplicationTypeCode('original')` -> null -> `?? 'fdaat1'`, and
         fdaat1 is NDA. Every package built without an explicit fda block
         declared itself a New Drug Application. The same default caught the
         real device pathways: `510k`, `de_novo`, `pma` — all enumerated in
         shared/schema/submissions.ts and offered in the UI — resolve to null
         because a 510(k) is not filed on this backbone at all, so a device
         dossier shipped as an NDA in the field the ESG routes on.
         applicationTypeToFdaCode's own contract says it "returns null for
         unknown values so callers can fail closed rather than mislabel an
         application" — stated at the definition, broken at its only call site.

       - `resolveSubmissionTypeCode('IND')` -> `fdast9`, because the only fdast
         entry containing "IND" is `IND Safety Reports`. Every orchestrator IND
         sequence — original, amendment, annual report — declared itself an IND
         safety report. core-to-packager.ts fixed this for the path that
         supplies an explicit fda block; the orchestrator supplies none, so the
         cross-vocabulary guess was still reachable here.

     So the field is classified once, and each vocabulary is asked only about a
     value that belongs to it. */
  const explicitApp = resolveApplicationTypeCode(fda.applicationType ?? '');
  const inferredApp = resolveApplicationTypeCode(input.submissionType);
  const appTypeCode = explicitApp ?? inferredApp;
  if (!appTypeCode) {
    throw new Error(
      `Cannot build the FDA regional backbone: no application type was supplied, and ` +
        `${JSON.stringify(input.submissionType)} is not one. The eCTD Module 1 ` +
        `application-type vocabulary covers NDA, sNDA, ANDA, BLA, IND and master ` +
        `files; device pathways (510(k), De Novo, PMA) and non-US pathways (MAA, ` +
        `CTA) have no code in it and must not be filed on this backbone. Pass ` +
        `fda.applicationType. Defaulting to fdaat1 would declare this package a ` +
        `New Drug Application, which is a statement about the filing, not a ` +
        `formatting detail.`,
    );
  }

  /* Only a value that is NOT an application type may be read as a submission
     type — that is what keeps 'IND' out of the fdast vocabulary. Sequence 0000
     is an original by definition, so deriving fdast1 for it is a fact; any
     later sequence could be an efficacy supplement, a CMC supplement or an
     annual report, and "Original Application" is not a safe guess for one. */
  const subTypeSource = fda.submissionType ?? (inferredApp ? undefined : input.submissionType);
  const subTypeCode = subTypeSource
    ? resolveSubmissionTypeCode(subTypeSource)
    : input.sequence === '0000'
      ? 'fdast1'
      : null;
  if (!subTypeCode) {
    throw new Error(
      `Cannot build the FDA regional backbone: submission-type is unresolved for ` +
        `sequence ${input.sequence} (${JSON.stringify(subTypeSource ?? null)}). Only ` +
        `sequence 0000 can be derived as an Original Application; a follow-up must ` +
        `supply fda.submissionType, because an efficacy supplement, a CMC ` +
        `supplement and an annual report are different filings and the backbone ` +
        `has to say which this is.`,
    );
  }

  const subSubTypeCode =
    resolveSubmissionSubTypeCode(fda.submissionSubType ?? 'original') ?? 'fdasst1';
  const submissionId = fda.submissionId ?? input.sequence;

  const contacts = fdaContactsBlock(fda.contacts ?? []);
  const forms = fda.forms?.length ? '\n' + fdaFormsBlock(fda.forms, resolve) : '';

  // Group Module 1 content leaves under FDA section heading elements.
  const assignId = createLeafIdAssigner();
  const bySection = new Map<string, string[]>();
  for (const l of input.leaves.filter((x) => x.ctdSection.startsWith('1'))) {
    const el = usRegionalSectionElement(l.ctdSection);
    const list = bySection.get(el) ?? [];
    list.push(leafElement(l, assignId(l), resolve(l)));
    bySection.set(el, list);
  }
  const m1Regional = [...bySection.entries()]
    .map(([el, leaves]) => `    <${el}>\n${leaves.map((x) => x.split('\n').map((y) => '      ' + y).join('\n')).join('\n')}\n    </${el}>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fda-regional:fda-regional SYSTEM "../../util/dtd/us-regional-v3-3.dtd">
<?xml-stylesheet type="text/xsl" href="../util/style/us-regional.xsl"?>
<fda-regional:fda-regional dtd-version="3.3" xml:lang="en"
    xmlns:fda-regional="http://www.ich.org/fda"
    xmlns:xlink="http://www.w3.org/1999/xlink">
  <admin>
${contacts}
    <application-set>
      <application>
        <application-information>
          <application-number application-type="${appTypeCode}">${escapeXml(input.applicationId)}</application-number>
        </application-information>
        <submission-information>
          <submission-id submission-type="${subTypeCode}">${escapeXml(submissionId)}</submission-id>
          <sequence-number submission-sub-type="${subSubTypeCode}">${escapeXml(input.sequence)}</sequence-number>${forms}
        </submission-information>
      </application>
    </application-set>
  </admin>
  <m1-regional>
${m1Regional}
  </m1-regional>
</fda-regional:fda-regional>`;
}

/**
 * EMA eu-regional.xml backbone. Per EMA EU eCTD Specification v3.0.
 * Module 1 sits under m1/eu/ with eu-regional.xml at the m1/eu/ root.
 */
function buildEmaBackbone(input: PackagerInput, resolve: (l: EctdLeaf) => LeafRef): string {
  const assignId = createLeafIdAssigner();
  const m1Leaves = input.leaves
    .filter((l) => l.ctdSection.startsWith('1'))
    .map((l) => leafElement(l, assignId(l), resolve(l)))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE eu-regional SYSTEM "../../util/dtd/eu-regional.dtd">
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
function buildPmdaBackbone(input: PackagerInput, resolve: (l: EctdLeaf) => LeafRef): string {
  const assignId = createLeafIdAssigner();
  const m1Leaves = input.leaves
    .filter((l) => l.ctdSection.startsWith('1'))
    .map((l) => leafElement(l, assignId(l), resolve(l)))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE jp-regional SYSTEM "../../util/dtd/jp-regional.dtd">
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
function buildHcBackbone(input: PackagerInput, resolve: (l: EctdLeaf) => LeafRef): string {
  const assignId = createLeafIdAssigner();
  const m1Leaves = input.leaves
    .filter((l) => l.ctdSection.startsWith('1'))
    .map((l) => leafElement(l, assignId(l), resolve(l)))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ca-regional SYSTEM "../../util/dtd/ca-regional.dtd">
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

function buildIndexXml(input: PackagerInput, m2to5: EctdLeaf[], resolve: (l: EctdLeaf) => LeafRef): string {
  // One assigner for the whole index.xml document (all of m2–m5 live here).
  const assignId = createLeafIdAssigner();
  // Fail loudly on any leaf that maps to no ICH module — otherwise it would be
  // silently dropped from the backbone (a submission document vanishing without
  // a trace). Module-1 leaves are already filtered out upstream, so anything
  // unmappable here is a genuinely out-of-range or malformed CTD section.
  const dropped = findDroppedLeaves(m2to5);
  if (dropped.length) {
    const detail = dropped.map((l) => `${l.ctdSection} (${l.fileName})`).join(', ');
    throw new ValidationError(
      `eCTD backbone cannot place ${dropped.length} leaf(s) — no ICH Module 2–5 ` +
        `heading matches: ${detail}. Assign each a valid CTD section.`,
      dropped.map((l) => `unplaceable-section:${l.ctdSection}`),
    );
  }
  // Render each leaf, then nest it under its authoritative ICH v3.2.2 heading.
  // Flat <m2>..<m5> is NOT a valid ectd:ectd child — the DTD requires the named
  // heading tree (m3-quality > m3-2-body-of-data > m3-2-s-drug-substance > leaf).
  // See ectd-packager/ich-headings.
  const rendered: RenderedLeaf[] = m2to5.map((l) => ({
    leaf: l,
    xml: leafElement(l, assignId(l), resolve(l)),
  }));
  const moduleBlocks = buildIchModuleTree(rendered, 2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd"
           xmlns:xlink="http://www.w3.org/1999/xlink"
           dtd-version="3.2">
${moduleBlocks}
</ectd:ectd>`;
}

/* ─── Top-level packager ──────────────────────────────────────────── */

export async function packageEctdSubmission(input: PackagerInput): Promise<SubmissionBundle> {
  /* Resolve the caller-supplied submission type through the canonical bridge.
     This normalizes any alias/legacy string (e.g. '510k', 'SNDA', 'ind') to
     the registry entry so that backbone XML, display names, and audit rows
     all use the same canonical identifier. The bridge returns null for
     unrecognized strings — in that case we fall through to the raw value,
     preserving backward compatibility for ad-hoc or org-specific types. */
  const registryEntry = resolveToRegistryEntry(input.submissionType);
  const canonicalSubmissionType = registryEntry?.applicationType ?? input.submissionType;
  const submissionTypeLabel = getSubmissionTypeLabel(input.submissionType);

  /* Build a normalized copy of the input for the backbone builders so they
     emit the canonical type into XML elements. The original PackagerInput
     is not mutated. */
  const normalizedInput: PackagerInput = {
    ...input,
    submissionType: canonicalSubmissionType,
  };

  const region = input.region;
  const m1FolderByRegion: Record<Region, string> = {
    fda:  'm1/us',
    ema:  'm1/eu',
    pmda: 'm1/jp',
    ca:   'm1/ca',
    uk:   'm1/uk',
    ch:   'm1/ch',
    au:   'm1/au',
    cn:   'm1/cn',
    br:   'm1/br',
    in:   'm1/in',
    kr:   'm1/kr',
    sg:   'm1/sg',
  };
  const backboneFileByRegion: Record<Region, string> = {
    fda:  `${m1FolderByRegion.fda}/us-regional.xml`,
    ema:  `${m1FolderByRegion.ema}/eu-regional.xml`,
    pmda: `${m1FolderByRegion.pmda}/jp-regional.xml`,
    ca:   `${m1FolderByRegion.ca}/ca-regional.xml`,
    uk:   `${m1FolderByRegion.uk}/uk-regional.xml`,
    ch:   `${m1FolderByRegion.ch}/ch-regional.xml`,
    au:   `${m1FolderByRegion.au}/au-regional.xml`,
    cn:   `${m1FolderByRegion.cn}/cn-regional.xml`,
    br:   `${m1FolderByRegion.br}/br-regional.xml`,
    in:   `${m1FolderByRegion.in}/in-regional.xml`,
    kr:   `${m1FolderByRegion.kr}/kr-regional.xml`,
    sg:   `${m1FolderByRegion.sg}/sg-regional.xml`,
  };

  const zip = new JSZip();
  const checksums: ChecksumEntry[] = [];
  const grades: LeafGradeRecord[] = [];

  /* PASS 1 — finalize every leaf's bytes FIRST, so the backbone can carry each
     leaf's real (post-PDF/A) MD5 as an inline `checksum` and a backbone-relative
     `xlink:href`. eCTD requires the checksum in the backbone to match the bytes
     shipped; finalization can change the bytes, so it must happen before the
     backbone is built. */
  interface PreparedLeaf { leaf: EctdLeaf; relPath: string; ref: LeafRef; bytes: Buffer; }
  const prepared: PreparedLeaf[] = [];
  const refByLeaf = new Map<EctdLeaf, LeafRef>();
  for (const leaf of input.leaves) {
    const sectionDashed = leaf.ctdSection.replace(/\./g, '-');

    // Backbone-only lifecycle delete: when the withdrawn document lives in a
    // PRIOR sequence, the delete leaf carries no new bytes (empty sourcePath) —
    // exactly what computeLifecycleOperations emits. Render it as
    // operation="delete" pointing at the prior file (modified-file, also used as
    // the xlink:href), but do NOT read a file, write it into this package, or
    // add a checksum line. A delete that DOES carry a sourcePath falls through
    // and is packaged normally (some callers ship superseding bytes with it).
    if (leaf.operation === 'delete' && !leaf.sourcePath) {
      const fallbackHref = leaf.ctdSection.startsWith('1')
        ? `${sectionDashed}/${leaf.fileName}`
        : `m${leaf.ctdSection.charAt(0)}/${sectionDashed}/${leaf.fileName}`;
      refByLeaf.set(leaf, { href: leaf.modifiedFile ?? fallbackHref, md5: leaf.md5 ?? '' });
      continue; // no bytes → no prepared entry, no ZIP file, no checksum line
    }

    const raw = await fs.readFile(leaf.sourcePath);
    const { bytes, md5Override, isPdf, converted, encrypted } = await finalizeLeafBytes(raw, leaf.fileName, input.skipPdfaConversion);
    grades.push({ fileName: leaf.fileName, isPdf, converted, encrypted });
    if (encrypted) {
      throw new ValidationError(
        `Leaf '${leaf.fileName}' is an encrypted/secured PDF; the eCTD PDF specification prohibits security settings and the package cannot ship it.`,
        [{ ruleId: 'LEAF-ENCRYPTED', severity: 'error', filePath: leaf.fileName }],
      );
    }
    // Hash the EXACT bytes about to be written into the zip — never a caller-
    // supplied leaf.md5. The eCTD checksum contract requires index-md5 to match
    // the shipped file; a pre-computed leaf.md5 can be stale/wrong (computed
    // against different bytes, before a re-render), which md5Override only
    // guards on the PDF/A-conversion branch. The bytes are already in memory, so
    // recomputing is free and makes the manifest correct by construction.
    const md5 = md5Override ?? createHash('md5').update(bytes).digest('hex');

    let relPath: string;
    let href: string;
    if (leaf.ctdSection.startsWith('1')) {
      // Module 1 → under the regional folder; href relative to the regional backbone.
      relPath = `${m1FolderByRegion[region]}/${sectionDashed}/${leaf.fileName}`;
      href = `${sectionDashed}/${leaf.fileName}`;
    } else {
      // Module 2–5 → shared folders; href relative to index.xml at the root.
      // Study-report leaves (studyId set) go under a per-study subfolder so each
      // study owns its folder + its own stf.xml (FDA STF convention).
      const studySub = leaf.studyId ? `/${studyFolderSlug(leaf.studyId)}` : '';
      relPath = `m${leaf.ctdSection.charAt(0)}/${sectionDashed}${studySub}/${leaf.fileName}`;
      href = relPath;
    }
    const ref: LeafRef = { href, md5 };
    refByLeaf.set(leaf, ref);
    prepared.push({ leaf, relPath, ref, bytes });
  }
  const resolve = (l: EctdLeaf): LeafRef => {
    const ref = refByLeaf.get(l);
    if (!ref) {
      // A leaf referenced by the backbone (e.g. an FDA transmittal form passed
      // in fda.forms) that was never in input.leaves is never read, hashed, or
      // written into the zip. Emitting a fabricated ref (empty/unverified md5 +
      // an href to a file that is absent from the package) would declare a
      // legally-required document present while it is missing. Fail closed: the
      // referenced leaf must be in input.leaves so it is actually packaged.
      throw new ValidationError(
        `regional-packager: leaf "${l.fileName}" (section ${l.ctdSection}) is referenced by the backbone but was not packaged — include it in input.leaves so it is read, hashed, and written into the submission.`,
        // ValidationError carries structured findings alongside the sentence —
        // this call was written with the message alone. Same shape as the
        // unplaceable-leaf refusal above, so a caller inspecting `findings`
        // sees this refusal too instead of only its text.
        [`unpackaged-referenced-leaf:${l.ctdSection}:${l.fileName}`],
      );
    }
    return ref;
  };

  /* PASS 1.5 — Study Tagging Files (FDA STF v2.6.1, audit gap G5). For each
     M4/M5 study (leaves carrying studyId + stfFileTag) generate a per-study
     stf.xml that tags the study's leaves, place it in the study's folder,
     reference it in index.xml, and checksum it. Graceful no-op when there are
     no study leaves. */
  const stfSyntheticLeaves: EctdLeaf[] = [];
  let stfSummary: { studies: number; leaves: number; untagged: number } | undefined;
  {
    const studyPrepared = prepared.filter(
      (p) => p.leaf.studyId && p.leaf.stfFileTag && !p.leaf.ctdSection.startsWith('1'),
    );
    if (studyPrepared.length > 0) {
      const byStudy = new Map<string, typeof studyPrepared>();
      for (const p of studyPrepared) {
        const list = byStudy.get(p.leaf.studyId!) ?? [];
        list.push(p);
        byStudy.set(p.leaf.studyId!, list);
      }
      const studyFolder = new Map<string, string>();
      const stfLeaves: StfLeaf[] = [];
      for (const [studyId, entries] of byStudy) {
        const folder = commonDir(entries.map((e) => e.relPath));
        studyFolder.set(studyId, folder);
        for (const e of entries) {
          stfLeaves.push({
            studyId,
            fileTag: e.leaf.stfFileTag!,
            ctdSection: e.leaf.ctdSection,
            href: e.relPath.slice(folder.length + 1), // relative to the study folder
            title: e.leaf.title,
            operation: e.leaf.operation,
          });
        }
      }
      const stfResult = generateStfFiles(stfLeaves, input.studyMeta ?? []);
      stfSummary = stfResult.summary;
      for (const file of stfResult.files) {
        const folder = studyFolder.get(file.studyId)!;
        const relPath = `${folder}/stf.xml`;
        const bytes = Buffer.from(file.xml, 'utf8');
        const md5 = createHash('md5').update(bytes).digest('hex');
        const section = byStudy.get(file.studyId)![0].leaf.ctdSection;
        const synthetic: EctdLeaf = {
          ctdSection: section, operation: 'new', sourcePath: '',
          fileName: 'stf.xml', title: `Study Tagging File — ${file.studyId}`,
        };
        const ref: LeafRef = { href: relPath, md5 };
        refByLeaf.set(synthetic, ref);
        prepared.push({ leaf: synthetic, relPath, ref, bytes });
        stfSyntheticLeaves.push(synthetic);
      }
    }
  }

  const backboneByRegion: Record<Region, () => string> = {
    fda:  () => buildFdaBackbone(normalizedInput, resolve),
    ema:  () => buildEmaBackbone(normalizedInput, resolve),
    pmda: () => buildPmdaBackbone(normalizedInput, resolve),
    ca:   () => buildHcBackbone(normalizedInput, resolve),
    // ICH-aligned / EU-structure regions use EMA backbone as the closest standard
    uk:   () => buildEmaBackbone(normalizedInput, resolve),
    ch:   () => buildEmaBackbone(normalizedInput, resolve),
    au:   () => buildEmaBackbone(normalizedInput, resolve),
    // CTD/eCTD regions without a distinct backbone builder — EMA ICH M4 fallback
    cn:   () => buildEmaBackbone(normalizedInput, resolve),
    br:   () => buildEmaBackbone(normalizedInput, resolve),
    in:   () => buildEmaBackbone(normalizedInput, resolve),
    kr:   () => buildEmaBackbone(normalizedInput, resolve),
    sg:   () => buildEmaBackbone(normalizedInput, resolve),
  };

  /* PASS 2 — write the regional Module 1 backbone (now that hrefs+md5s exist). */
  const regionalXml = backboneByRegion[region]();
  const regionalPath = backboneFileByRegion[region];
  zip.file(regionalPath, regionalXml);
  checksums.push({
    relPath: regionalPath,
    md5: createHash('md5').update(regionalXml).digest('hex'),
  });

  /* Write all finalized leaf bytes. */
  for (const p of prepared) {
    zip.file(p.relPath, p.bytes);
    checksums.push({ relPath: p.relPath, md5: p.ref.md5 });
  }
  // Module 2–5 leaves for index.xml, including the generated STF files so each
  // stf.xml is a referenced leaf in the backbone (not an orphan file).
  const m2to5 = [
    ...input.leaves.filter((l) => !l.ctdSection.startsWith('1')),
    ...stfSyntheticLeaves,
  ];

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
     are vendored per assets/ectd-dtd/README.md (or come from $ECTD_DTD_DIR), so
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

  /* Cross-reference resolution (intra-package hyperlinks). Resolve declared
     references against the leaf set; a broken (dangling / withdrawn-target)
     reference is an eCTD technical-validation defect. Surfaced on the bundle;
     blocks a production build when ECTD_REQUIRE_XREF=true (report-only default,
     mirroring the PDF/A + DTD gates). */
  const xref = resolveCrossReferences(input.leaves, input.crossReferences ?? []);
  if (!xref.ok && xrefRequiredFromEnv() && (input.environment ?? 'production') === 'production') {
    const detail = xref.broken.map((b) => `${b.source}→${b.target} (${b.reason})`).join(', ');
    throw new ValidationError(
      `eCTD package has ${xref.broken.length} broken cross-reference(s): ${detail}. ` +
        `Resolve them, or clear ECTD_REQUIRE_XREF for non-submission builds.`,
      xref.broken.map((b) => `${b.source}→${b.target}: ${b.reason}`),
    );
  }

  /* Write the ICH M2-M5 index.xml + index-md5.txt. */
  const indexXml = buildIndexXml(input, m2to5, resolve);
  const indexXmlMd5 = createHash('md5').update(indexXml).digest('hex');
  zip.file('index.xml', indexXml);
  checksums.push({ relPath: 'index.xml', md5: indexXmlMd5 });

  // ICH eCTD v3.2.2 REQUIRES `index-md5.txt` at the SEQUENCE ROOT holding the
  // bare MD5 of index.xml — regional validators (FDA eValidator / EMA / PMDA)
  // reject a sequence whose backbone checksum file is missing. (The additional
  // `util/index-md5.txt` full-file manifest below is a platform convenience, not
  // the spec artifact, and is not a substitute for the root file.)
  zip.file('index-md5.txt', indexXmlMd5);
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

  // Per-sequence leaf manifest for cross-sequence lifecycle diffing: each shipped
  // leaf's CTD section + final href + md5 (+ op/title). The NEXT sequence loads
  // this (loadPriorSequenceManifest) and diffs against it to derive
  // replace/append/delete. Raw shape (not built via sequence-manifest) to keep
  // the packager free of an ectd/ import; the ectd-side caller runs
  // buildLeafManifest over it before persisting.
  const leafManifest = prepared.map((p) => ({
    ctdSection: p.leaf.ctdSection,
    fileName: p.leaf.fileName,
    href: p.relPath,
    md5: p.ref.md5,
    ...(p.leaf.operation ? { operation: p.leaf.operation } : {}),
    ...(p.leaf.title ? { title: p.leaf.title } : {}),
  }));

  return {
    path:      outPath,
    sha256:    createHash('sha256').update(buffer).digest('hex'),
    sizeBytes: buffer.length,
    leafManifest,
    format,
    displayName: `${input.productName} · ${region.toUpperCase()} ${submissionTypeLabel} #${input.sequence}`,
    submissionGrade,
    dtdStatus: {
      required: dtdGate.required,
      present: dtdGate.present,
      missing: dtdGate.missing,
      selfContained: dtdGate.selfContained,
    },
    // Honest regional-M1 status: only fda/ema/pmda/ca have their own backbone
    // builder; the eight widened regions reuse the EMA structure, so their
    // `<cc>-regional.xml` is a PLACEHOLDER and must never read as conformant.
    regionalBackbone: classifyRegionalBackbone(region, regionalPath),
    ...(stfSummary ? { stf: stfSummary } : {}),
    ...(input.crossReferences?.length
      ? {
          crossReferenceStatus: {
            resolved: xref.resolved.length,
            broken: xref.broken.map((b) => ({ source: b.source, target: b.target, reason: b.reason })),
            ok: xref.ok,
          },
        }
      : {}),
  };
}
