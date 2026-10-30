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
 * 2026-10-30: the official STF v2.6.1 §III.B was read for CSR document
 * roles. The body role is study-report-body; the unsupported study-report
 * spelling is refused for emitted documents. The mixed list's other regional
 * and dataset claims retain the provenance limits below.
 * The same source's pp9–10 identify the exact US roles classified below.
 * Its pp4–5 require the STF stylesheet reference; the current FDA standards
 * table links stylesheet 2.3 as ich-stf-stylesheet-2-3.xsl.
 *
 * What rests on a search extract and what is recall alone (2026-10-05,
 * g-stf-name-tags-and-shape; the record is
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-stf-name-tags-and-shape-facts.md). fda.gov and ich.org are refused by this
 * environment's egress policy, so no document was opened. A passage read in
 * search results quoting the FDA- or ICH-hosted document is recall, not
 * regulator text (shared/regulatory/regulatory-basis.ts):
 *
 *   Recall, from search extracts of the regulator-hosted document:
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
 *   Recall, with no extract of the regulator's text seen:
 *   - The element nesting: ectd:study > study-identifier, then study-document >
 *     doc-content[xlink:href = "<path to index.xml>#<leaf ID>"] > title?, file-tag;
 *     info-type for roles outside the source-observed ICH/US values; dtd-version "2.2" (the
 *     STF DTD the DOCTYPE names, ich-stf-v2-2.dtd).
 *   - That a deleted leaf is not tagged (it ships no file).
 *   - The document file-tag list STF_DOCUMENT_FILE_TAGS. It only warns.
 *   - The eCTD file-name character rule is the platform's one copy of it,
 *     FILENAME_PATTERN in shared/regulatory/ectd-leaf-rules.ts (re-exported
 *     through ectd-regional-rules.ts for existing server callers).
 *
 * Until 2026-10-05 every file was named 'stf.xml', file-tags were free text,
 * each tag wrapped <leaf> elements pointing at the PDFs, and a default
 * <study-category>clinical-study-report</study-category> was written that is no
 * STF category (finding 36, docs/design/ANA_REGULATORY_RECORD.md).
 *
 * @module server/services/ectd/stf-generator
 */

import { stfFileName } from '../../../shared/regulatory/ectd-leaf-rules';
import { STF_DTD, STF_STYLESHEET } from './dtd-bundler';
export { stfFileName } from '../../../shared/regulatory/ectd-leaf-rules';
import { FDA_STUDY_DATA_TRC, ICH_STF_SPEC_261, recall } from '../ind/ctd/regulatory-basis';
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

export interface StfOptions {
  dtdSystemPath?: (studyId: string) => string;
  stylesheetPath?: (studyId: string) => string;
}

/**
 * The STF file-tags FDA's validation 1735 requires on standardized datasets and
 * their define.xml. Recall, from a search extract of FDA's text (see the module header).
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
 * CSR role values were checked in STF v2.6.1 §III.B pp8–9 on 2026-10-30.
 * Other entries remain recall; an unknown tag retains the advisory behavior.
 * The exact unsupported study-report spelling is separately refused.
 */
export const STF_DOCUMENT_FILE_TAGS: { readonly tags: readonly string[]; readonly basis: RegulatoryBasis } = {
  tags: [
    'synopsis', 'study-report-body', 'legacy-clinical-study-report', 'pre-clinical-study-report',
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
  basis: recall('ICH eCTD STF Specification v2.6.1, mixed file-tag list (fda.gov/media/159383); selected CSR/US values read, remaining regional/dataset values unverified'),
};

const STF_DTD_VERSION = '2.2';

/** Exact existing roles marked US in ICH STF v2.6.1 §III.B pp9–10,
 * FDA media159383, read 2026-10-30. This does not qualify modern dataset
 * refinements or infer a regional classification for an unknown role. */
const STF_US_FILE_TAGS: ReadonlySet<string> = new Set([
  'data-tabulation-data-definition', 'data-listing-dataset',
  'data-listing-data-definition', 'analysis-program', 'analysis-data-definition',
  'annotated-crf', 'subject-profiles', 'safety-report', 'antibacterial', 'special-pathogen',
]);

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  if (leaf.operation !== 'delete' && leaf.fileTag === 'study-report') {
    throw new Error(
      `${ICH_STF_SPEC_261.ref}: "study-report" is not a defined file-tag; the CSR body role is "study-report-body". ` +
        'Reassemble the CSR or correct its study-tagging metadata before packaging.',
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
function renderStf(studyId: string, title: string, tagged: readonly StfLeaf[], options: StfOptions): string {
  const dtdSystemPath = options.dtdSystemPath?.(studyId) ?? STF_DTD;
  const stylesheetPath = options.stylesheetPath?.(studyId) ?? STF_STYLESHEET;
  const docContents = tagged.map(
    (l) =>
      `    <doc-content xlink:href="${escapeXml(`${l.indexRelPath}#${l.indexLeafId}`)}">\n` +
      `      <title>${escapeXml(l.title)}</title>\n` +
      `      <file-tag name="${escapeXml(l.fileTag)}" info-type="${STF_US_FILE_TAGS.has(l.fileTag) ? 'us' : 'ich'}"/>\n` +
      `    </doc-content>`,
  );

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<?xml-stylesheet type="text/xsl" href="${escapeXml(stylesheetPath)}"?>\n` +
    `<!DOCTYPE ectd:study SYSTEM "${escapeXml(dtdSystemPath)}">\n` +
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
export function generateStfFiles(leaves: StfLeaf[], studyMeta: StfStudyMeta[] = [], options: StfOptions = {}): StfResult {
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

    const xml = renderStf(studyId, meta?.studyTitle ?? studyId, tagged, options);
    files.push({ studyId, fileName, xml, leafCount: tagged.length });
  }

  return {
    files,
    summary: { studies: files.length, leaves: leaves.length - untagged, untagged },
    warnings,
  };
}

export default { generateStfFiles };
