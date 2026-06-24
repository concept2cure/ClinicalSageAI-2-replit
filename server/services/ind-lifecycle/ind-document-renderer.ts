/**
 * IND lifecycle document → submission-ready PDF.
 *
 * Bridges the structured document models produced by the RA lifecycle services
 * (IND Safety Report, IND Annual Report) to real, navigable PDF bytes via the
 * deterministic structured leaf renderer — so the output is an actual eCTD leaf
 * (valid PDF, page-accurate bookmarks) rather than just an in-memory model.
 *
 * Deterministic: identical models render to byte-identical PDFs (the md5
 * contract), so a re-render does not perturb a sequence's index-md5.
 *
 * INTEGRATION NOTES (human): exposed at POST /api/ind-lifecycle/safety-report/pdf
 * and /annual-report/pdf. To file the result, write the bytes to a leaf source
 * path and register it via submission-service (sequence type 'amendment' for a
 * safety report, 'annual' for the annual report) per each service's header.
 */

import { renderStructuredLeafPdf, renderLeafPdf, type LeafSection } from '../ectd/leaf-pdf-renderer';
import {
  getSubmissionTypeLabel,
} from '../../../shared/regulatory/submission-type-bridge.js';
import type {
  IndSafetyReportDocument,
  IndSafetyReportSection,
} from './ind-safety-report-service';
import type { IndAnnualReportModel } from './ind-annual-report-service';
import type { LetterOfAuthorizationModel } from './ind-loa-service';
import type {
  RightOfReferenceStatementModel,
  AuthorizedPersonsListModel,
} from './ind-cross-reference-service';
import type { BriefingBookModel } from './ind-briefing-book-service';
import type { CoverLetterModel } from './ind-cover-letter-service';
import type { PackageManifest } from './ind-package-manifest';
import type { SequenceDiff } from './ind-sequence-diff';

/** Map a (possibly nested) safety-report section to a renderer LeafSection, numbering it. */
function safetySectionToLeaf(
  section: IndSafetyReportSection,
  index: number,
  prefix: string,
): LeafSection {
  const code = prefix ? `${prefix}.${index}` : String(index);
  return {
    heading: section.heading,
    sectionCode: code,
    body: section.body,
    children: section.children?.map((child, i) => safetySectionToLeaf(child, i + 1, code)),
  };
}

/** Render a structured IND Safety Report (21 CFR 312.32) to a PDF leaf. */
export async function renderIndSafetyReportPdf(doc: IndSafetyReportDocument): Promise<Buffer> {
  const sections = doc.sections.map((s, i) => safetySectionToLeaf(s, i + 1, ''));
  return renderStructuredLeafPdf(sections, {
    title: `IND Safety Report (${doc.obligation})`,
    sectionCode: 'm5.3.5',
  });
}

/** Render an IND Annual Report / DSUR (21 CFR 312.33) to a PDF leaf. */
export async function renderIndAnnualReportPdf(model: IndAnnualReportModel): Promise<Buffer> {
  const sections: LeafSection[] = model.sections.map((s, i) => ({
    heading: s.heading,
    sectionCode: String(i + 1),
    body: s.body && s.body.length > 0 ? s.body : '[To be completed by the sponsor.]',
  }));
  return renderStructuredLeafPdf(sections, {
    title: `IND Annual Report — ${model.productName} (IND ${model.indNumber})`,
    sectionCode: 'm1.13',
  });
}

/** Render a Letter of Authorization (eCTD m1.4.1) to a PDF leaf. */
export async function renderLetterOfAuthorizationPdf(model: LetterOfAuthorizationModel): Promise<Buffer> {
  const sections: LeafSection[] = model.sections.map((s, i) => ({
    heading: s.heading,
    sectionCode: String(i + 1),
    body: s.body && s.body.length > 0 ? s.body : '[To be completed.]',
  }));
  return renderStructuredLeafPdf(sections, {
    title: `Letter of Authorization — ${model.referencedFileType} ${model.referencedFileNumber}`,
    sectionCode: 'm1.4.1',
  });
}

/** Render a Statement of Right of Reference (eCTD m1.4.2) to a PDF leaf. */
export async function renderRightOfReferenceStatementPdf(model: RightOfReferenceStatementModel): Promise<Buffer> {
  const sections: LeafSection[] = model.sections.map((s, i) => ({
    heading: s.heading,
    sectionCode: String(i + 1),
    body: s.body && s.body.length > 0 ? s.body : '[To be completed.]',
  }));
  return renderStructuredLeafPdf(sections, {
    title: `Statement of Right of Reference — ${model.referencedFileType} ${model.referencedFileNumber}`,
    sectionCode: 'm1.4.2',
  });
}

/** Render a List of Authorized Persons (eCTD m1.4.3) to a PDF leaf. */
export async function renderAuthorizedPersonsListPdf(model: AuthorizedPersonsListModel): Promise<Buffer> {
  const sections: LeafSection[] = model.sections.map((s, i) => ({
    heading: s.heading,
    sectionCode: String(i + 1),
    body: s.body && s.body.length > 0 ? s.body : '[To be completed.]',
  }));
  return renderStructuredLeafPdf(sections, {
    title: 'List of Authorized Persons to Incorporate by Reference',
    sectionCode: 'm1.4.3',
  });
}

/** Render an eCTD sequence diff (amendment review) to a PDF. */
export async function renderSequenceDiffPdf(diff: SequenceDiff): Promise<Buffer> {
  const header = [
    `Prior sequence: ${diff.priorSequenceNumber}`,
    `Current sequence: ${diff.currentSequenceNumber}`,
    `Added: ${diff.summary.added}  |  Replaced: ${diff.summary.replaced}  |  Unchanged: ${diff.summary.unchanged}  |  Deleted: ${diff.summary.deleted}`,
  ].join('\n');

  const sections: LeafSection[] = [{ heading: 'Diff Summary', sectionCode: '', body: header }];
  for (const kind of ['added', 'replaced', 'deleted', 'unchanged'] as const) {
    const rows = diff.entries.filter((e) => e.change === kind);
    if (rows.length === 0) continue;
    const body = rows
      .map((e) => `${e.sectionCode}  ${e.title}  —  ${e.priorChecksum ?? '(none)'} → ${e.currentChecksum ?? '(none)'}`)
      .join('\n');
    sections.push({ heading: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} (${rows.length})`, body });
  }

  return renderStructuredLeafPdf(sections, {
    title: `eCTD Sequence Diff — ${diff.priorSequenceNumber} → ${diff.currentSequenceNumber}`,
  });
}

/** Render an IND submission package manifest (QC review artifact) to a PDF. */
export async function renderPackageManifestPdf(manifest: PackageManifest): Promise<Buffer> {
  // Resolve the submission type through the canonical bridge for display; the
  // manifest may already carry a normalized label, but the bridge is idempotent.
  const displaySubType = manifest.submissionType
    ? getSubmissionTypeLabel(manifest.submissionType)
    : null;

  const header = [
    manifest.applicationNumber ? `Application: ${manifest.applicationNumber}` : null,
    `Sequence: ${manifest.sequenceNumber}`,
    displaySubType ? `Submission type: ${displaySubType}` : null,
    `Total leaves: ${manifest.totalLeaves}  |  Missing checksums: ${manifest.missingChecksums}`,
  ]
    .filter(Boolean)
    .join('\n');

  const sections: LeafSection[] = [{ heading: 'Submission Summary', sectionCode: '', body: header }];
  for (const mod of manifest.modules) {
    const rows = mod.leaves
      .map((l) => `${l.sectionCode}  [${l.lifecycleOp}]  ${l.title}  —  md5: ${l.checksum ?? '(none)'}`)
      .join('\n');
    sections.push({ heading: mod.label, sectionCode: mod.module, body: rows });
  }

  return renderStructuredLeafPdf(sections, { title: `IND Package Manifest — Sequence ${manifest.sequenceNumber}` });
}

/** Render an IND cover letter (eCTD Module 1.2) to a PDF leaf. */
export async function renderCoverLetterPdf(model: CoverLetterModel): Promise<Buffer> {
  // A cover letter is one continuous letter, not a section tree — render flat
  // with a single document-level bookmark.
  return renderLeafPdf(model.body, { title: 'IND Cover Letter', sectionCode: 'm1.2' });
}

/** Render an FDA meeting briefing book (Pre-IND / Type A/B/C) to a PDF. */
export async function renderBriefingBookPdf(model: BriefingBookModel): Promise<Buffer> {
  const sections: LeafSection[] = model.sections.map((s) => ({
    heading: s.heading,
    body: s.body && s.body.length > 0 ? s.body : '[To be completed by the sponsor.]',
  }));
  return renderStructuredLeafPdf(sections, {
    title: `FDA Briefing Document — ${model.productName} (${model.indication})`,
    sectionCode: 'm1.6',
  });
}
