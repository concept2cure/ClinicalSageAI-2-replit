/**
 * CSR slice 5 (2026-10-30, docs/design/CSR_END_TO_END_2026-10-29.md): the
 * number-to-source verdict of a saved CSR in Authoring, for critique_document.
 *
 * Inputs, all read by the caller from one authorized snapshot:
 *   - the saved sections (their stored content and accepted text);
 *   - the claim receipts the CSR import carried for each section
 *     (WorkflowSectionOrigin.csrEvidence, csr/csr-claim-receipts.ts);
 *   - the retained run's tables, read again now through the receipt-verified
 *     reader (saved-clinical-tables readSavedClinicalTables).
 *
 * The existing gates decide: verifyCsrDocumentEvidence binds each section's
 * claims to its saved hash and the run's evidence digest and reconciles every
 * claim to its cell (csr-claim-reconciliation). This module adds what a claim
 * list cannot see on its own: every number a section states without a claim,
 * a claimed figure the section no longer states, and the same figure stated
 * differently in two places (the synopsis says 15/305, §11.4 and its table
 * say 16/305). Pure; it reads nothing and decides no approval.
 */
import { createHash } from 'node:crypto';
import { verifyCsrDocumentEvidence, type CsrDocumentSectionEvidence } from './csr-document-evidence-gate';
import type { CsrClaimReceipt, CsrEvidenceFact } from './csr-claim-reconciliation';
import { buildCsrAuthoringEvidence, type CsrAuthoringEvidence, type RetainedCsrTables } from '../csr/cortex-authoring-context';
import { parseImportedCsrSectionEvidence, type CsrImportedSectionEvidence } from '../csr/csr-claim-receipts';
import { findUnclaimedNumbers } from '../csr/unsupplied-statistics';
import { editedClaimOutcome } from './csr-edited-section';

export interface SavedCsrSection { code: string | null; content: string; text: string; title?: string }
export type RetainedRunRead = { ok: true; tables: RetainedCsrTables } | { ok: false; code: string };
export interface CsrEvidenceRun { programId: string; runId: string }
export interface CsrCell { table: string; row: number; column: number; claimed: string | null; current: string | null }
export interface SavedCsrEvidenceIssue {
  section: string;
  code: string;
  claimId?: string;
  cell?: CsrCell;
  /** The figure as this section states it, when that is the problem. */
  stated?: string;
  /** Other sections that state the cell's figure. */
  statedIn?: string[];
  /** false when the issue is reported for review but does not block (a claimed figure an edit removed). */
  blocking?: boolean;
}
/** A section whose text changed after import, re-reconciled against its receipts and the retained run. */
export interface SavedCsrEditedSection {
  section: string;
  state: 'edited after import, re-checked';
  importedSha256: string;
  currentSha256: string;
}
export interface SavedCsrEvidenceVerdict {
  status: 'not_assessed' | 'blocked' | 'reconciled_pending_human_review';
  basis: 'exact_retained_table_cell';
  checkedSections: number;
  checkedClaims: number;
  runs: Array<CsrEvidenceRun & { source: 'verified' | 'unavailable'; code?: string }>;
  issues: SavedCsrEvidenceIssue[];
  /** Sections edited after import: re-checked by their current text, not blocked on the hash alone. */
  editedSections: SavedCsrEditedSection[];
  /** Every number a saved section states that no claim carries; blocking in results sections. */
  unclaimedFigures: Array<{ section: string; figure: string; blocking: boolean }>;
  /** Flattened, for critiqueDocument's own claim reconciliation. */
  claims: CsrClaimReceipt[];
  facts: CsrEvidenceFact[];
}

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const runKey = (r: CsrEvidenceRun) => `${r.programId.toLowerCase()}:${r.runId.toLowerCase()}`;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
// Ordered-list markers the renderer adds ("1. ") are layout, not figures.
const figureText = (text: string) => text.replace(/^[ \t]*\d+\.[ \t]/gm, ' ');
const RATIO = /(\d+)\s*(?:\/|of)\s*(\d+)/g;
// Review of slice 5 (2026-10-30): the results sections are E3 §2 and §10–13 by
// number, not "the sections with a table mapping": §10.2 and §11.3 have no
// mapping, so no claim can carry their figures, and a figure there must block.
const RESULTS = /^(?:2|1[0-3])(?:\.\d+)*$/;

/** The claim receipts a saved document's CSR import carried, by section code. */
export function importedCsrEvidence(provenance: unknown): Map<string, CsrImportedSectionEvidence> {
  const out = new Map<string, CsrImportedSectionEvidence>();
  const source = object(provenance) ? provenance.importSource : null;
  if (!object(source) || source.kind !== 'csr' || !Array.isArray(source.sectionOrigins)) return out;
  for (const origin of source.sectionOrigins) {
    if (!object(origin) || typeof origin.code !== 'string' || origin.csrEvidence === undefined) continue;
    const parsed = parseImportedCsrSectionEvidence(origin.csrEvidence);
    if (parsed && parsed.sectionNumber === origin.code && !out.has(origin.code)) out.set(origin.code, parsed);
  }
  return out;
}

/** The retained runs the caller must read for these receipts. */
export function csrEvidenceRuns(receipts: Map<string, CsrImportedSectionEvidence>): CsrEvidenceRun[] {
  const runs = new Map<string, CsrEvidenceRun>();
  for (const r of receipts.values()) runs.set(runKey(r), { programId: r.programId, runId: r.runId });
  return [...runs.values()];
}

interface SectionPlan {
  code: string; content: string; text: string; receipts: CsrImportedSectionEvidence | null;
  unclaimed: string[]; results: boolean;
  /** SHA-256 of the saved content when it differs from the hash the receipts were bound to at import. */
  editedSha256: string | null;
}

function planSection(s: SavedCsrSection & { code: string }, receipts: CsrImportedSectionEvidence | undefined): SectionPlan {
  const claimed = receipts?.claims.map(c => c.value) ?? [];
  const info = receipts?.studyInformationNumbers ?? [];
  const unclaimed = findUnclaimedNumbers(figureText(s.text), { claimed, info }).map(n => n.text);
  const current = receipts ? sha(s.content) : null;
  return { code: s.code, content: s.content, text: s.text, receipts: receipts ?? null, unclaimed, results: RESULTS.test(s.code),
    editedSha256: current && current !== receipts?.sectionSha256 ? current : null };
}

const cellId = (code: string, c: { table: string; row: number; column: number }) => `${code}:${c.table}[${c.row}][${c.column}]`;

/** The section's evidence pack, rebuilt now from the retained run, or null when the source cannot be read. */
function currentPack(r: CsrImportedSectionEvidence, reads: Map<string, RetainedRunRead>): CsrAuthoringEvidence | null {
  const read = reads.get(runKey(r));
  if (!read?.ok) return null;
  try {
    return buildCsrAuthoringEvidence(read.tables, { programId: r.programId, runId: r.runId, studyId: r.studyId, sectionNumber: r.sectionNumber });
  } catch {
    return null;
  }
}

function sectionFacts(code: string, r: CsrImportedSectionEvidence, pack: CsrAuthoringEvidence | null): CsrEvidenceFact[] {
  if (!pack) return [];
  const facts = new Map<string, CsrEvidenceFact>();
  for (const c of r.claims) {
    const table = pack.tables.find(t => t.key === c.table);
    const cells = table?.rows[c.row];
    const value = cells?.[c.column];
    if (!table || value === undefined) continue;
    facts.set(cellId(code, c), { factId: cellId(code, c), sourceId: pack.runId, sourceSha256: pack.evidenceDigest,
      sourceLocation: `study ${pack.studyId}, ${c.table} row ${c.row} column ${c.column}`,
      // Read now through the receipt-verified reader: the source is current and
      // not withdrawn. This is source integrity, not clinical verification.
      status: 'qualified', analysisPopulation: table.headers[c.column] ?? '', endpoint: cells?.[0] ?? '', cellText: value });
  }
  return [...facts.values()];
}

function sectionClaims(code: string, r: CsrImportedSectionEvidence): CsrClaimReceipt[] {
  return r.claims.map((c, i) => ({ claimId: `${code}#${i}`, section: code, factId: cellId(code, c), sourceSha256: r.evidenceDigest,
    analysisPopulation: c.population, endpoint: c.endpoint, cellText: c.value }));
}

function gateEntry(plan: SectionPlan, reads: Map<string, RetainedRunRead>) {
  const r = plan.receipts;
  if (!r) return { entry: { snapshot: { sectionId: plan.code, savedContent: plan.content, anaRunId: '' }, binding: null, claims: [] }, facts: [] };
  const pack = currentPack(r, reads);
  const claims = sectionClaims(plan.code, r);
  const entry: CsrDocumentSectionEvidence = {
    snapshot: { sectionId: plan.code, savedContent: plan.content, anaRunId: `${r.runId}:${pack?.evidenceDigest ?? 'unavailable'}` },
    // An edited section is re-bound to its current text: the claim-by-claim
    // re-check below (editedClaimOutcome) replaces the hash comparison.
    binding: { sectionId: plan.code, sectionSha256: plan.editedSha256 ?? r.sectionSha256, anaRunId: `${r.runId}:${r.evidenceDigest}`, claimIds: claims.map(c => c.claimId) },
    claims,
  };
  return { entry, facts: sectionFacts(plan.code, r, pack) };
}

/**
 * Each claimed figure against the section's current text: still stated, changed
 * to a figure no cell holds (FIGURE_CHANGED, blocking, naming the cell it was
 * likely meant to be), or no longer stated (CLAIM_NOT_STATED; reported without
 * blocking when a writer's edit removed it, blocking otherwise).
 */
function unstatedClaims(plan: SectionPlan, facts: Map<string, CsrEvidenceFact>): SavedCsrEvidenceIssue[] {
  if (!plan.receipts) return [];
  const text = figureText(plan.text);
  const values = plan.receipts.claims.map(c => c.value);
  return plan.receipts.claims.flatMap((c, i): SavedCsrEvidenceIssue[] => {
    const outcome = editedClaimOutcome(text, c, values);
    if (outcome.state === 'stated') return [];
    const cell = { table: c.table, row: c.row, column: c.column, claimed: c.value, current: facts.get(cellId(plan.code, c))?.cellText ?? null };
    const base = { section: plan.code, claimId: `${plan.code}#${i}`, cell };
    if (outcome.state === 'changed') return [{ ...base, code: 'FIGURE_CHANGED', stated: outcome.stated }];
    // A figure an edit removed blocks in a results section (§2, §10-13): there a removal cannot be told apart
    // from a swap to a value another claim carries. Elsewhere it is reported, not blocking (decision 8).
    return [{ ...base, code: 'CLAIM_NOT_STATED', ...(plan.editedSha256 && !plan.results ? { blocking: false } : {}) }];
  });
}

type Ledger = Map<string, { cell: CsrCell; statedIn: Set<string> }>;

/** Every claimed cell in the document, with the sections that state it. */
function claimLedger(plans: SectionPlan[], facts: Map<string, CsrEvidenceFact>): Ledger {
  const ledger: Ledger = new Map();
  for (const p of plans) for (const c of p.receipts?.claims ?? []) {
    const key = `${p.receipts?.runId}:${c.table}[${c.row}][${c.column}]`;
    const at = ledger.get(key) ?? { cell: { table: c.table, row: c.row, column: c.column, claimed: c.value,
      current: facts.get(cellId(p.code, c))?.cellText ?? null }, statedIn: new Set<string>() };
    at.statedIn.add(p.code);
    ledger.set(key, at);
  }
  return ledger;
}

/** The claimed cells whose n/N has this denominator and a different numerator. */
function conflictingCells(ledger: Ledger, numerator: string, denominator: string) {
  return [...ledger.values()].filter(({ cell }) =>
    [...(cell.current ?? cell.claimed ?? '').matchAll(RATIO)].some(x => x[2] === denominator && x[1] !== numerator));
}

/** n/N figures stated without a claim that disagree with a claimed cell of the same denominator elsewhere. */
function crossSectionConflicts(plans: SectionPlan[], facts: Map<string, CsrEvidenceFact>): SavedCsrEvidenceIssue[] {
  const ledger = claimLedger(plans, facts);
  const issues: SavedCsrEvidenceIssue[] = [];
  for (const p of plans) {
    const unclaimed = new Set(p.unclaimed);
    for (const m of figureText(p.text).matchAll(RATIO)) {
      if (!unclaimed.has(m[1])) continue;
      for (const { cell, statedIn } of conflictingCells(ledger, m[1], m[2])) {
        issues.push({ section: p.code, code: 'CROSS_SECTION_CONFLICT', stated: m[0], cell, statedIn: [...statedIn].filter(s => s !== p.code) });
      }
    }
  }
  return issues;
}

function claimFindingIssues(result: ReturnType<typeof verifyCsrDocumentEvidence>, claims: CsrClaimReceipt[], facts: Map<string, CsrEvidenceFact>, plans: SectionPlan[]): SavedCsrEvidenceIssue[] {
  return result.claimFindings.map(f => {
    const claim = claims.find(c => c.claimId === f.claimId);
    const plan = plans.find(p => p.code === f.sectionId);
    const index = Number(f.claimId.split('#').pop());
    const c = plan?.receipts?.claims[index];
    return { section: f.sectionId, code: f.code, claimId: f.claimId,
      ...(c && claim ? { cell: { table: c.table, row: c.row, column: c.column, claimed: c.value, current: facts.get(claim.factId)?.cellText ?? null } } : {}) };
  });
}

/**
 * The saved CSR's evidence verdict. not_assessed only when the document holds
 * no claim receipts at all; every unclaimed number is still listed then.
 */
export function assessSavedCsrEvidence(
  sections: readonly SavedCsrSection[],
  receipts: Map<string, CsrImportedSectionEvidence>,
  reads: Map<string, RetainedRunRead>,
): SavedCsrEvidenceVerdict {
  const plans = planSections(sections, receipts);
  const unclaimedFigures = plans.flatMap(p => p.unclaimed.map(figure => ({ section: p.code, figure, blocking: p.results })));
  const runs = csrEvidenceRuns(receipts).map(r => {
    const read = reads.get(runKey(r));
    return read?.ok ? { ...r, source: 'verified' as const } : { ...r, source: 'unavailable' as const, code: read && !read.ok ? read.code : 'CSR_EVIDENCE_NOT_READ' };
  });
  const base = { basis: 'exact_retained_table_cell' as const, runs, unclaimedFigures };
  if (!receipts.size) return { ...base, status: 'not_assessed', checkedSections: 0, checkedClaims: 0, issues: [], editedSections: [], claims: [], facts: [] };
  const manifest = plans.filter(inManifest);
  // A section the import carried receipts for that the document no longer holds.
  const present = new Set(plans.map(p => p.code));
  const missing = [...receipts.keys()].filter(code => !present.has(code)).map(code => ({ section: code, code: 'MISSING_SECTION' }));
  const built = manifest.map(p => gateEntry(p, reads));
  const facts = built.flatMap(b => b.facts);
  const claims = built.flatMap(b => b.entry.claims);
  const factById = new Map(facts.map(f => [f.factId, f]));
  const result = verifyCsrDocumentEvidence(manifest.map(p => p.code), built.map(b => b.entry), facts);
  const issues: SavedCsrEvidenceIssue[] = [
    ...result.issues.map(i => ({ section: i.sectionId, code: i.code })),
    ...missing,
    ...runs.filter(r => r.source === 'unavailable').map(r => ({ section: '', code: r.code ?? 'CSR_EVIDENCE_NOT_READ' })),
    ...claimFindingIssues(result, claims, factById, plans),
    ...manifest.flatMap(p => unstatedClaims(p, factById)),
    ...crossSectionConflicts(plans, factById),
  ];
  const editedSections = plans.flatMap(p => p.receipts && p.editedSha256 ? [{ section: p.code, state: 'edited after import, re-checked' as const,
    importedSha256: p.receipts.sectionSha256, currentSha256: p.editedSha256 }] : []);
  // result.status is not read on its own: every one of its issues is in `issues`.
  const blocked = issues.some(i => i.blocking !== false) || unclaimedFigures.some(f => f.blocking);
  return { ...base, status: blocked ? 'blocked' : 'reconciled_pending_human_review', checkedSections: result.checkedSections,
    checkedClaims: result.checkedClaims, issues, editedSections, claims, facts };
}

/** The document verdict checks a section that carries claims, or a results section stating a figure. */
function inManifest(p: SectionPlan): boolean {
  return (p.receipts?.claims.length ?? 0) > 0 || (p.results && p.unclaimed.length > 0);
}

/** A section without a code (added in the editor) is still read: its numbers
 * are listed and take part in the cross-section check, under its title. */
function planSections(sections: readonly SavedCsrSection[], receipts: Map<string, CsrImportedSectionEvidence>): SectionPlan[] {
  return sections.map((s, i) => typeof s.code === 'string' && s.code.trim() ? { ...s, code: s.code }
    : { ...s, code: `(uncoded section ${i + 1}${s.title?.trim() ? `: ${s.title.trim().slice(0, 80)}` : ''})` })
    .map(s => planSection(s, receipts.get(s.code)));
}

/** One saved section's input to reviewCsrSectionWithEvidence (medical_writing_review
 * with a document reference, 2026-10-30), built exactly as the document verdict
 * builds its manifest entry. `checked` is false when the document verdict leaves the
 * section out of its manifest: no claims and no figure that must be claimed. */
export interface SavedCsrSectionEvidenceInput {
  label: string;
  checked: boolean;
  entry: CsrDocumentSectionEvidence;
  facts: CsrEvidenceFact[];
}
export function savedCsrSectionEvidenceInput(
  sections: readonly SavedCsrSection[],
  receipts: Map<string, CsrImportedSectionEvidence>,
  reads: Map<string, RetainedRunRead>,
  index: number,
): SavedCsrSectionEvidenceInput {
  const plan = planSections(sections, receipts)[index];
  if (!plan) throw new Error('Saved section outside the document');
  const { entry, facts } = gateEntry(plan, reads);
  return { label: plan.code, checked: inManifest(plan), entry, facts };
}
