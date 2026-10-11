/**
 * FDA Study Tagging File (STF) generator — architecture spec §5.1
 *
 * Emits one Study Tagging File per study (ICH eCTD STF Specification v2.6.1, as
 * FDA hosts it at fda.gov/media/159383) that tags the M4/M5 leaves of a study
 * with their controlling study identifier and file-tags. The packager places it
 * in the study's folder and references it from index.xml.
 *
 * PURE + DETERMINISTIC: no DB, no filesystem, no network, no LLM. The caller
 * (the regional packager) owns where each file lands and supplies, for every
 * leaf, its index.xml leaf ID and the STF's relative path to index.xml; this
 * returns the XML keyed by study.
 *
 * What is regulator text and what is recall (2026-10-05, g-stf-name-tags-and-shape;
 * the record is docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-stf-name-tags-and-shape-facts.md). fda.gov and ich.org are refused by this
 * environment's egress policy, so "regulator text" below means the passage was
 * read in search results quoting the FDA- or ICH-hosted document, not opened:
 *
 *   Regulator text (search):
 *   - File name: "stf-" followed by the sponsor's study-id, then ".xml"
 *     (ICH STF v2.6.1, fda.gov/media/159383).
 *   - File-tags are heading elements inside doc-content; the study is described
 *     by study-identifier, holding title, study-id and category (same source).
 *   - FDA eCTD validation 1735 (high severity): the correct STF file-tags must be
 *     used for every standardized dataset and its define.xml — .xpt:
 *     data-tabulation-dataset-sdtm, data-tabulation-dataset-send,
 *     analysis-dataset-adam; define.xml: data-tabulation-data-definition (SDTM
 *     and SEND), analysis-data-definition (ADaM) (FDA TRC material,
 *     fda.gov/media/160970, 135256, 123099).
 *
 *   Recall, not checked against the regulator's text:
 *   - The element nesting: ectd:study > study-identifier, then study-document >
 *     doc-content[xlink:href = "<path to index.xml>#<leaf ID>"] > title?, file-tag;
 *     the info-type="ich" attribute on every file-tag; dtd-version "2.2" (the
 *     STF DTD the DOCTYPE names, ich-stf-v2-2.dtd).
 *   - That a deleted leaf is not tagged (it ships no file).
 *   - The document file-tag list STF_DOCUMENT_FILE_TAGS. It only warns.
 *   - The eCTD file-name character rule is the platform's one copy of it,
 *     FILENAME_PATTERN in ectd-regional-rules.ts.
 *
 * Until 2026-10-05 every file was named 'stf.xml', file-tags were free text,
 * each tag wrapped <leaf> elements pointing at the PDFs, and a default
 * <study-category>clinical-study-report</study-category> was written that is no
 * STF category (finding 36, docs/design/ANA_REGULATORY_RECORD.md).
 *
 * @module server/services/ectd/stf-generator
 */

import { FILENAME_PATTERN } from './ectd-regional-rules';
import { FDA_STUDY_DATA_TRC, recall } from '../ind/ctd/regulatory-basis';
import type { RegulatoryBasis } from '../ind/ctd/types';

export type StfOperation = 'new' | 'append' | 'replace' | 'delete';

/** A single study leaf to be tagged into its study's STF. */
export interface StfLeaf {
  /**
   * Controlling study identifier, written verbatim into <study-id> (it must
   * match STUDYID in the study's datasets). The file name uses it case-folded.
   */
  studyId: string;
  /**
   * STF file-tag classifying the file within the study. A standardized dataset
   * (.xpt) or define.xml must carry one of STF_DATASET_FILE_TAGS (TRC 1735; the
   * generator refuses anything else). A document's tag is checked against the
   * recall list STF_DOCUMENT_FILE_TAGS and only warns.
   */
  fileTag: string;
  /** CTD section (e.g. '5.3.5.1', '4.2.1.1'). */
  ctdSection: string;
  /** Package-relative path of the leaf's file; decides whether it is a dataset or define.xml. */
  href: string;
  /** Display title. */
  title: string;
  /** Lifecycle operation for this leaf in the current sequence. A delete is not tagged. */
  operation: StfOperation;
  /** The leaf's ID attribute in index.xml, which the doc-content points at. */
  indexLeafId: string;
  /** Relative path from the STF's folder to index.xml, e.g. '../../../index.xml'. */
  indexRelPath: string;
}

/** Per-study metadata for the STF header. */
export interface StfStudyMeta {
  studyId: string;
  studyTitle?: string;
  /**
   * Not written. An STF <category> is a named, typed value (recall: species,
   * route of administration, duration, control type), which one string cannot
   * express. A value passed here is reported in `warnings`, never dropped
   * silently and never written under a made-up category name.
   */
  studyCategory?: string;
}

export interface StfFile {
  /** The study-id as the sponsor wrote it. */
  studyId: string;
  /** "stf-" + case-folded study-id + ".xml". */
  fileName: string;
  xml: string;
  /** doc-content elements written (deleted leaves are not tagged). */
  leafCount: number;
}

export interface StfResult {
  files: StfFile[];
  summary: { studies: number; leaves: number; untagged: number };
  /** Advisory findings: document tags outside the recall list, category values not written. */
  warnings: string[];
}

/**
 * The STF file-tags FDA's validation 1735 requires on standardized datasets and
 * their define.xml. Regulator text read through search (see the module header).
 */
export const STF_DATASET_FILE_TAGS: {
  readonly xpt: readonly string[];
  readonly define: readonly string[];
  readonly basis: RegulatoryBasis;
} = {
  xpt: ['data-tabulation-dataset-sdtm', 'data-tabulation-dataset-send', 'analysis-dataset-adam'],
  define: ['data-tabulation-data-definition', 'analysis-data-definition'],
  basis: FDA_STUDY_DATA_TRC,
};

/**
 * ICH STF file-tags for study documents and non-standardized data, from recall.
 * A tag outside this list is reported as a warning, not refused, until the list
 * is checked against the STF specification (fda.gov/media/159383).
 */
export const STF_DOCUMENT_FILE_TAGS: { readonly tags: readonly string[]; readonly basis: RegulatoryBasis } = {
  tags: [
    'synopsis', 'study-report', 'legacy-clinical-study-report', 'pre-clinical-study-report',
    'protocol-or-amendment', 'sample-case-report-form', 'iec-irb-consent-form-list',
    'list-description-investigator-site', 'signatures-investigators', 'list-patients-with-batches',
    'randomisation-scheme', 'audit-certificates-report', 'statistical-methods-interim-analysis-plan',
    'inter-laboratory-standardisation-methods-quality-assurance', 'publications-based-on-study',
    'publications-referenced-in-report', 'discontinued-patients', 'protocol-deviations',
    'patients-excluded-from-efficacy-analysis', 'demographic-data', 'compliance-and-drug-concentration-data',
    'individual-efficacy-response-data', 'adverse-event-listings',
    'listing-individual-laboratory-measurements-by-patient', 'case-report-forms', 'available-on-request',
    'annotated-crf', 'subject-profiles', 'safety-report', 'antibacterial', 'special-pathogen',
    'data-tabulation-dataset-legacy', 'analysis-dataset-legacy', 'data-listing-dataset',
    'data-listing-data-definition', 'analysis-program',
  ],
  basis: recall('ICH eCTD STF Specification v2.6.1, file-tag list (fda.gov/media/159383), not read'),
};

const STF_DTD_VERSION = '2.2';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The STF file name for a study: "stf-" + study-id + ".xml", case-folded because
 * eCTD file names are lower case. Throws when the result breaks the eCTD
 * file-name rule (FILENAME_PATTERN) — a study id with a space, '&', '_' or '/',
 * or one too long — rather than inventing a different name for the study.
 */
export function stfFileName(studyId: string): string {
  const name = `stf-${studyId.toLowerCase()}.xml`;
  if (!FILENAME_PATTERN.test(name)) {
    throw new Error(
      `Study id "${studyId}" cannot form its Study Tagging File name: "${name}" breaks the eCTD file-name rule ` +
        `(lower case a-z, 0-9, '.', '-'; at most 64 characters). The STF is named "stf-" + study-id + ".xml" ` +
        `(ICH STF v2.6.1); give the study an id that fits rather than have the platform rename it.`,
    );
  }
  return name;
}

/** The file-tag a dataset or define.xml leaf must carry, or null for a document leaf. */
function datasetTagsFor(href: string): readonly string[] | null {
  const base = href.slice(href.lastIndexOf('/') + 1).toLowerCase();
  if (base.endsWith('.xpt')) return STF_DATASET_FILE_TAGS.xpt;
  if (base === 'define.xml') return STF_DATASET_FILE_TAGS.define;
  return null;
}

/**
 * Refuse a study leaf the STF cannot describe correctly; record an advisory
 * warning for a document tag outside the recall list.
 */
function checkStfLeaf(leaf: StfLeaf, warnings: string[]): void {
  if (!leaf.fileTag) {
    throw new Error(`STF leaf "${leaf.title}" (study ${leaf.studyId}) is missing a file-tag.`);
  }
  if (!leaf.indexLeafId) {
    throw new Error(
      `STF leaf "${leaf.title}" (study ${leaf.studyId}) has no index.xml leaf ID: a doc-content points at the leaf's ID in index.xml.`,
    );
  }
  if (!leaf.indexRelPath) {
    throw new Error(`STF leaf "${leaf.title}" (study ${leaf.studyId}) has no relative path to index.xml.`);
  }
  const required = datasetTagsFor(leaf.href);
  if (required && !required.includes(leaf.fileTag)) {
    throw new Error(
      `FDA TRC 1735: "${leaf.href}" (study ${leaf.studyId}) is tagged "${leaf.fileTag}"; a standardized ` +
        `${required === STF_DATASET_FILE_TAGS.xpt ? 'dataset (.xpt)' : 'define.xml'} must be tagged ${required.join(', ')}. ` +
        `A wrong tag is a technical rejection. Legacy (non-standardized) datasets are not packaged by this platform.`,
    );
  }
  if (!required && !STF_DOCUMENT_FILE_TAGS.tags.includes(leaf.fileTag)) {
    warnings.push(
      `STF file-tag "${leaf.fileTag}" on "${leaf.title}" (study ${leaf.studyId}) is not in the reviewed STF file-tag list ` +
        `(recall, not yet checked against the ICH STF specification); confirm it before filing.`,
    );
  }
}

/** The STF document for one study: study-identifier, then a doc-content per tagged leaf. */
function renderStf(studyId: string, title: string, tagged: readonly StfLeaf[]): string {
  const docContents = tagged.map(
    (l) =>
      `    <doc-content xlink:href="${escapeXml(`${l.indexRelPath}#${l.indexLeafId}`)}">\n` +
      `      <title>${escapeXml(l.title)}</title>\n` +
      `      <file-tag name="${escapeXml(l.fileTag)}" info-type="ich"/>\n` +
      `    </doc-content>`,
  );

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE ectd:study SYSTEM "ich-stf-v2-2.dtd">\n` +
    `<ectd:study xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="${STF_DTD_VERSION}">\n` +
    `  <study-identifier>\n` +
    `    <title>${escapeXml(title)}</title>\n` +
    `    <study-id>${escapeXml(studyId)}</study-id>\n` +
    `  </study-identifier>\n` +
    `  <study-document>\n` +
    `${docContents.join('\n')}\n` +
    `  </study-document>\n` +
    `</ectd:study>\n`
  );
}

/**
 * Build one Study Tagging File per study from study-tagged leaves.
 *
 * Leaves without a `studyId` are skipped and counted in `summary.untagged`.
 *
 * @throws when a tagged leaf has no file-tag, no index.xml leaf ID or no path to
 *   index.xml; when a dataset or define.xml leaf carries a tag outside the TRC
 *   1735 list; when a study id cannot form an eCTD file name; or when two study
 *   ids fold to the same file name.
 */
export function generateStfFiles(leaves: StfLeaf[], studyMeta: StfStudyMeta[] = []): StfResult {
  const metaById = new Map(studyMeta.map((m) => [m.studyId, m]));
  const byStudy = new Map<string, StfLeaf[]>();
  const warnings: string[] = [];
  let untagged = 0;

  for (const leaf of leaves) {
    if (!leaf.studyId) {
      untagged++;
      continue;
    }
    checkStfLeaf(leaf, warnings);
    const list = byStudy.get(leaf.studyId) ?? [];
    list.push(leaf);
    byStudy.set(leaf.studyId, list);
  }

  for (const m of studyMeta) {
    if (m.studyCategory && byStudy.has(m.studyId)) {
      warnings.push(
        `Study ${m.studyId}: category "${m.studyCategory}" was not written — an STF category is a named, typed value, not free text.`,
      );
    }
  }

  const files: StfFile[] = [];
  const studyByFileName = new Map<string, string>();
  // Deterministic study order.
  for (const studyId of [...byStudy.keys()].sort()) {
    const fileName = stfFileName(studyId);
    const clash = studyByFileName.get(fileName);
    if (clash !== undefined) {
      throw new Error(`Studies "${clash}" and "${studyId}" would both get the same STF file name "${fileName}".`);
    }
    studyByFileName.set(fileName, studyId);

    const meta = metaById.get(studyId);
    const tagged = byStudy
      .get(studyId)!
      .filter((l) => l.operation !== 'delete')
      .sort((a, b) => a.fileTag.localeCompare(b.fileTag) || a.indexLeafId.localeCompare(b.indexLeafId));
    // A study whose leaves are all deleted in this sequence has nothing to tag.
    if (tagged.length === 0) continue;

    const xml = renderStf(studyId, meta?.studyTitle ?? studyId, tagged);
    files.push({ studyId, fileName, xml, leafCount: tagged.length });
  }

  return {
    files,
    summary: { studies: files.length, leaves: leaves.length - untagged, untagged },
    warnings,
  };
}

export default { generateStfFiles };
