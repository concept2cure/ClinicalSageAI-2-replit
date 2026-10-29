/**
 * medical_writing_review with a document reference (D2-CSR, 2026-10-30,
 * docs/evidence/D2-CSR/2026-10-30-medical-writing-review-document-ref/).
 *
 * The free-text tool cannot run the evidence check: no receipts can bind to
 * text with no saved identity. Given the saved Authoring document id and a
 * section, this reads that section inside one authorized REPEATABLE READ
 * snapshot (saved-document-critique readAuthorizedSavedDocument), re-reads the
 * retained run behind the CSR import's claim receipts (readCsrEvidenceRuns),
 * and runs the existing reviewCsrSectionWithEvidence over the saved section's
 * content with its receipts and the current cells (csr-saved-evidence). The
 * whole-document verdict (assessSavedCsrEvidence) supplies what one section's
 * claim list cannot see: its unclaimed figures, a claimed figure it no longer
 * states and an n/N another section contradicts.
 *
 * Read-only; no model call; never approval. A non-CSR document, an unknown
 * section or any failed read is refused, never reported as agreement.
 */
import type { RequestSqlClient } from '../../db/requestDb';
import { withTenantConnection } from '../../db/withTenantConnection';
import type { ToolContext } from './AnaToolExecutor';
import { reviewCsrSectionWithEvidence, type MedicalWritingReview } from './medical-writing-review';
import { assessSavedCsrEvidence, importedCsrEvidence, savedCsrSectionEvidenceInput, type SavedCsrEvidenceIssue } from './csr-saved-evidence';
import {
  currentContext, defaultRetainedReader, inSavedDocumentSnapshot, readAuthorizedSavedDocument, readCsrEvidenceRuns, savedIsCsr,
  type Connection, type RetainedTableReader, type SavedSection,
} from './saved-document-critique';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE = 'AnA Medical-Writing QC';
const MAX_LISTED = 40;
const refuse = (error: string) => JSON.stringify({ source: SOURCE, scope: 'saved_section', error, complete: false });

const INSTRUCTION = 'csrSectionEvidence comes first. writing is the indexed CSR heading review of this one saved section\'s stored content against the full ICH E3 outline, so headings held by other sections read as not detected. csrSectionEvidence re-reads the retained run behind the section\'s claim receipts: blocked names the cell, claim or figure that failed; a section edited after import is re-checked by its current text (edited). not_assessed means the document carries no claim receipts, or this section carries none and states no figure that must be claimed. reconciled_pending_human_review is transcription agreement only, never scientific review or approval. For the whole document use critique_document.';

/** Section by its code, or by its saved id. Ambiguity is refused, not resolved. */
function findSection(saved: SavedSection[], ref: string): number | 'ambiguous' | 'missing' {
  const byId = saved.findIndex(s => s.sectionId.toLowerCase() === ref.toLowerCase());
  if (byId >= 0) return byId;
  const byCode = saved.flatMap((s, i) => s.code?.trim() === ref.trim() ? [i] : []);
  if (byCode.length > 1) return 'ambiguous';
  return byCode.length === 1 ? byCode[0] : 'missing';
}

export function documentReferenceError(input: Record<string, unknown>): string | null {
  if (typeof input.document_id !== 'string' || !UUID.test(input.document_id)) return 'Provide the saved Authoring document_id (a UUID) with section.';
  if (typeof input.section !== 'string' || !input.section.trim() || input.section.length > 120) return 'Provide section: the saved section\'s E3 number (for example 11.4) or its id.';
  if (input.draft_text !== undefined) return 'Provide either draft_text or document_id with section, not both. A document reference reviews the saved section\'s stored text.';
  return null;
}

const listed = <T>(items: T[]) => ({ items: items.slice(0, MAX_LISTED), ...(items.length > MAX_LISTED ? { truncated: true, total: items.length } : {}) });

interface SectionVerdictInput {
  label: string;
  documentHasReceipts: boolean;
  gate: ReturnType<typeof reviewCsrSectionWithEvidence> | null;
  issues: SavedCsrEvidenceIssue[];
  unclaimed: Array<{ figure: string; blocking: boolean }>;
  edited: ReturnType<typeof assessSavedCsrEvidence>['editedSections'][number] | null;
}

function sectionStatus(v: SectionVerdictInput): 'not_assessed' | 'blocked' | 'reconciled_pending_human_review' {
  if (!v.documentHasReceipts) return 'not_assessed';
  if (v.gate?.evidence.status === 'blocked' || v.issues.some(i => i.blocking !== false) || v.unclaimed.some(f => f.blocking)) return 'blocked';
  return v.gate ? 'reconciled_pending_human_review' : 'not_assessed';
}

function sectionEvidence(v: SectionVerdictInput, runs: ReturnType<typeof assessSavedCsrEvidence>['runs']) {
  const issues = listed(v.issues.map(({ section: _s, ...rest }) => rest));
  const figures = listed(v.unclaimed);
  return {
    status: sectionStatus(v), basis: 'exact_retained_table_cell' as const, section: v.label,
    sectionGate: v.gate ? { status: v.gate.evidence.status, issues: v.gate.evidence.issues, checkedClaims: v.gate.evidence.checkedClaims,
      findings: v.gate.evidence.findings } : null,
    issues: issues.items, ...(issues.truncated ? { issuesTruncated: true, issueCount: issues.total } : {}),
    unclaimedFigures: figures.items, ...(figures.truncated ? { unclaimedFiguresTruncated: true, unclaimedFigureCount: figures.total } : {}),
    ...(v.edited ? { edited: v.edited } : {}),
    runs,
  };
}

async function reviewSection(q: RequestSqlClient, ctx: ToolContext & { organizationId: number; userId: number },
  input: Record<string, unknown>, readRetained: RetainedTableReader): Promise<string> {
  const documentId = input.document_id as string;
  const { project, header, saved } = await readAuthorizedSavedDocument(q, ctx, documentId);
  if (!savedIsCsr(header)) return refuse('The document reference runs the CSR evidence check, and this saved document is not a CSR. Use critique_document for a saved document, or draft_text for a free-text heading review.');
  const index = findSection(saved, input.section as string);
  if (index === 'ambiguous') return refuse('More than one saved section has this number. Provide the section id.');
  if (index === 'missing') return refuse('No saved section in this document has this number or id.');
  const receipts = importedCsrEvidence(header.provenance);
  const reads = await readCsrEvidenceRuns(q, receipts, { organizationId: ctx.organizationId, userId: ctx.userId }, readRetained);
  const document = assessSavedCsrEvidence(saved, receipts, reads);
  const one = savedCsrSectionEvidenceInput(saved, receipts, reads, index);
  const gate = reviewCsrSectionWithEvidence(one.entry.snapshot, one.entry.binding, one.entry.claims, one.facts);
  const s = saved[index];
  const verdict: SectionVerdictInput = {
    label: one.label, documentHasReceipts: receipts.size > 0, gate: receipts.size > 0 && one.checked ? gate : null,
    // Run-level failures carry no section; they bind every section the run backs.
    issues: document.issues.filter(i => i.section === one.label || i.section === ''),
    unclaimed: document.unclaimedFigures.filter(f => f.section === one.label).map(({ figure, blocking }) => ({ figure, blocking })),
    edited: document.editedSections.find(e => e.section === one.label) ?? null,
  };
  const head = {
    source: SOURCE, scope: 'saved_section', complete: true, engine: 'deterministic', documentId, programId: project.programId,
    section: { sectionId: s.sectionId, code: s.code, title: s.title.slice(0, 120), updatedAt: s.updatedAt, sha256: s.sha256 },
    csrSectionEvidence: sectionEvidence(verdict, document.runs),
    readyForApproval: false as const, instruction: INSTRUCTION,
  };
  return fitted(head, gate.writing);
}

/** capToolResultForModel's per-result ceiling: a longer result reaches the model cut in the middle. */
const PER_RESULT_MAX = 8000;

/** The evidence verdict first and whole; the writing review whole when it fits, else
 * without its two restatements of missingSections, said so; else refused. */
function fitted(head: Record<string, unknown>, writing: MedicalWritingReview): string {
  const full = JSON.stringify({ ...head, writing });
  if (full.length <= PER_RESULT_MAX) return full;
  const rest: MedicalWritingReview = { ...writing };
  delete rest.structureCoverage;
  const condensed = JSON.stringify({ ...head, writing: { ...rest, checklist: writing.checklist.filter(item => item.category !== 'structure'),
    condensed: 'structureCoverage and the structure checklist items are omitted to fit the result: missingSections and detectedHeadings state the same heading result.' } });
  return condensed.length <= PER_RESULT_MAX ? condensed
    : refuse('This section\'s review exceeds the tool result limit. Use critique_document, which pages its items.');
}

/** medical_writing_review's document-reference path. Refuses rather than guesses. */
export async function reviewSavedSectionWriting(input: Record<string, unknown>, ctx?: ToolContext,
  connection: Connection = withTenantConnection, readRetained: RetainedTableReader = defaultRetainedReader): Promise<string> {
  const invalid = documentReferenceError(input);
  if (invalid) return refuse(invalid);
  if (!currentContext(ctx)) return refuse('Open an authorized project before reviewing a saved section.');
  try {
    return await inSavedDocumentSnapshot(ctx, connection, 'ana-medical-writing-review-saved-section', q => reviewSection(q, ctx, input, readRetained));
  } catch {
    return refuse('The saved section could not be read and verified: check current project and document access and the 512-section / 8 MiB content limits. No review is returned.');
  }
}
