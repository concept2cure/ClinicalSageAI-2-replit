/**
 * FDA Study Tagging File (STF) generator — architecture spec §5.1
 *
 * Emits a real per-study `stf.xml` (FDA STF Specification v2.6.1) that tags the
 * M4/M5 study-report leaves of a study with their controlling study identifier
 * and file-tags. The audit found only a single `util/stf.xml` "submission
 * tracking" stub (`ectdExportService.ts`) — NOT a true per-study STF tree; this
 * fills that gap.
 *
 * PURE + DETERMINISTIC: no DB, no filesystem, no network, no LLM. Consumes the
 * study-id tagging the existing `ectd-validator-hardening.ts: auditStudyIdTagging`
 * already enforces, and produces leaves the same validator can check. No new
 * backbone generator, no duplicate path logic — the caller (packager) owns where
 * each `stf.xml` lands; this returns the XML keyed by study.
 *
 * @module server/services/ectd/stf-generator
 */

export type StfOperation = 'new' | 'append' | 'replace' | 'delete';

/** A single study-report leaf to be tagged into a study's STF. */
export interface StfLeaf {
  /** Controlling study identifier (matches CDISC ODM / FDA STF). */
  studyId: string;
  /**
   * STF file-tag classifying the document within the study, e.g.
   * 'study-report-body', 'protocol-or-amendment', 'sample-crf',
   * 'statistical-analysis-plan', 'data-listing'. Free text per the STF
   * controlled vocabulary.
   */
  fileTag: string;
  /** CTD section (e.g. '5.3.5.1', '4.2.1.1'). */
  ctdSection: string;
  /** Relative href of the leaf within the package. */
  href: string;
  /** Display title. */
  title: string;
  /** Lifecycle operation for this leaf in the current sequence. */
  operation: StfOperation;
}

/** Per-study metadata for the STF header. */
export interface StfStudyMeta {
  studyId: string;
  studyTitle?: string;
  /** STF study category, e.g. 'clinical-study-report', 'nonclinical'. */
  studyCategory?: string;
}

export interface StfFile {
  studyId: string;
  /** Suggested filename — always 'stf.xml' (placed in the study folder by the caller). */
  fileName: string;
  xml: string;
  leafCount: number;
}

export interface StfResult {
  files: StfFile[];
  summary: { studies: number; leaves: number; untagged: number };
}

const STF_DTD_VERSION = '2.6.1';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build one `stf.xml` per study from study-tagged leaves.
 *
 * Leaves without a `studyId` are skipped and counted in `summary.untagged`
 * (the hardening validator separately flags these as STF_MISSING_STUDY_ID).
 *
 * @throws if a leaf has a studyId but an empty fileTag (ambiguous STF tagging).
 */
export function generateStfFiles(leaves: StfLeaf[], studyMeta: StfStudyMeta[] = []): StfResult {
  const metaById = new Map(studyMeta.map(m => [m.studyId, m]));
  const byStudy = new Map<string, StfLeaf[]>();
  let untagged = 0;

  for (const leaf of leaves) {
    if (!leaf.studyId) {
      untagged++;
      continue;
    }
    if (!leaf.fileTag) {
      throw new Error(`STF leaf "${leaf.title}" (study ${leaf.studyId}) is missing a file-tag.`);
    }
    const list = byStudy.get(leaf.studyId) ?? [];
    list.push(leaf);
    byStudy.set(leaf.studyId, list);
  }

  const files: StfFile[] = [];
  // Deterministic study order.
  for (const studyId of [...byStudy.keys()].sort()) {
    const studyLeaves = byStudy.get(studyId)!;
    const meta = metaById.get(studyId);

    // Group leaves by file-tag, tags sorted for determinism.
    const byTag = new Map<string, StfLeaf[]>();
    for (const l of studyLeaves) {
      const t = byTag.get(l.fileTag) ?? [];
      t.push(l);
      byTag.set(l.fileTag, t);
    }

    const tagBlocks = [...byTag.keys()].sort().map(tag => {
      const leafEls = byTag
        .get(tag)!
        .map(
          l =>
            `        <leaf operation="${l.operation}" xlink:href="${escapeXml(l.href)}">\n` +
            `          <title>${escapeXml(l.title)}</title>\n` +
            `        </leaf>`
        )
        .join('\n');
      return `      <file-tag name="${escapeXml(tag)}">\n${leafEls}\n      </file-tag>`;
    });

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!DOCTYPE ectd:study SYSTEM "ich-stf-v2-2.dtd">\n` +
      `<ectd:study xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="${STF_DTD_VERSION}">\n` +
      `  <study-id>${escapeXml(studyId)}</study-id>\n` +
      `  <title>${escapeXml(meta?.studyTitle ?? studyId)}</title>\n` +
      `  <study-category>${escapeXml(meta?.studyCategory ?? 'clinical-study-report')}</study-category>\n` +
      `  <doc-content>\n` +
      `${tagBlocks.join('\n')}\n` +
      `  </doc-content>\n` +
      `</ectd:study>\n`;

    files.push({ studyId, fileName: 'stf.xml', xml, leafCount: studyLeaves.length });
  }

  return {
    files,
    summary: { studies: files.length, leaves: leaves.length - untagged, untagged },
  };
}

export default { generateStfFiles };
