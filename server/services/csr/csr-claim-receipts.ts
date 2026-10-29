/**
 * CSR slice 5 (2026-10-30, docs/design/CSR_END_TO_END_2026-10-29.md): the
 * claim receipts of one evidence-bound drafted section, bound to the exact
 * text that was saved and to the retained run's evidence digest, so that a
 * saved CSR can be re-checked against its source after import into Authoring.
 *
 * Pure. Built from what slice 2 already computes: the section's evidence pack
 * (cortex-authoring-context buildCsrAuthoringEvidence) and the exact-cell
 * findings acceptEvidenceBoundDraft wrote to lineage.reconciliation. Nothing
 * here decides that a figure is right; it records which cell each figure came
 * from, so the saved-document gate can look at that cell again.
 */
import { createHash } from 'node:crypto';
import type { CsrAuthoringEvidence } from './cortex-authoring-context.js';
import { findUnclaimedNumbers } from './unsupplied-statistics.js';

export const CSR_CLAIM_RECEIPTS_SCHEMA = 'c2c.csr-claim-receipts.v1' as const;

/** One figure the section states and the retained engine-table cell it states. */
export interface CsrCellClaim {
  table: string;
  row: number;
  column: number;
  /** The exact cell text at drafting. */
  value: string;
  /** The row's label (first cell) at drafting: the evidence fact's endpoint. */
  endpoint: string;
  /** The column header at drafting: the evidence fact's population/arm label. */
  population: string;
}

/** Written to csr_section_outputs.lineage.claimReceipts when a bound draft is accepted. */
export interface CsrSectionClaimReceipts {
  schema: typeof CSR_CLAIM_RECEIPTS_SCHEMA;
  programId: string;
  runId: string;
  studyId: string;
  sectionNumber: string;
  /** The section's evidence pack digest; changes when any of its tables changes. */
  evidenceDigest: string;
  /** SHA-256 of the retained source document the run tabulated. */
  sourceSha256: string;
  /** SHA-256 of the saved job output (csr_section_outputs.content_hash). */
  outputSha256: string;
  claims: CsrCellClaim[];
}

/** What an Authoring import carries per CSR section (WorkflowSectionOrigin.csrEvidence). */
export interface CsrImportedSectionEvidence extends CsrSectionClaimReceipts {
  /** SHA-256 of the Authoring section as the import stored it (the copy, not the job output). */
  sectionSha256: string;
  /** Numbers the section states that came from the job's study information, not a table cell. */
  studyInformationNumbers: string[];
}

const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max;
const index = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/**
 * The receipts for an accepted evidence-bound section, or null when the
 * reconciliation is absent or did not match every claim (then nothing binds).
 */
export function buildCsrClaimReceipts(
  evidence: CsrAuthoringEvidence, reconciliation: unknown, content: string,
): CsrSectionClaimReceipts | null {
  if (!object(reconciliation) || reconciliation.evidenceDigest !== evidence.evidenceDigest || !Array.isArray(reconciliation.findings)) return null;
  const claims = (reconciliation.findings as unknown[]).map(f => receiptClaim(evidence, f));
  if (claims.some(c => c === null)) return null;
  return { schema: CSR_CLAIM_RECEIPTS_SCHEMA, programId: evidence.programId, runId: evidence.runId,
    studyId: evidence.studyId, sectionNumber: evidence.sectionNumber, evidenceDigest: evidence.evidenceDigest,
    sourceSha256: evidence.source.sha256, outputSha256: sha(content), claims: claims as CsrCellClaim[] };
}

/** One matched exact-cell finding as a receipt claim; null for anything that did not match its cell. */
function receiptClaim(evidence: CsrAuthoringEvidence, f: unknown): CsrCellClaim | null {
  if (!object(f) || f.status !== 'matches' || !text(f.table) || !index(f.row) || !index(f.column) || !text(f.expected)) return null;
  const table = evidence.tables.find(t => t.key === f.table);
  const cells = table?.rows[f.row];
  if (!table || cells?.[f.column] !== f.expected) return null;
  return { table: f.table, row: f.row, column: f.column, value: f.expected, endpoint: cells[0] ?? '', population: table.headers[f.column] ?? '' };
}

function validClaim(c: unknown): c is CsrCellClaim {
  return object(c) && text(c.table, 120) && index(c.row) && index(c.column) && text(c.value) && text(c.endpoint) && text(c.population);
}

const uuid = (v: unknown): v is string => text(v) && UUID.test(v);
const hash = (v: unknown): v is string => text(v) && HASH.test(v);

function validReceiptsHeader(v: Record<string, unknown>): boolean {
  return v.schema === CSR_CLAIM_RECEIPTS_SCHEMA && uuid(v.programId) && uuid(v.runId) && text(v.studyId, 120) && !!v.studyId.trim() &&
    text(v.sectionNumber, 20) && hash(v.evidenceDigest) && hash(v.sourceSha256) && hash(v.outputSha256);
}

/** A stored receipts value, validated field by field; anything malformed is null. */
export function parseCsrClaimReceipts(value: unknown): CsrSectionClaimReceipts | null {
  if (!object(value) || !validReceiptsHeader(value) || !Array.isArray(value.claims) || value.claims.length > 200 || !value.claims.every(validClaim)) return null;
  const v = value as unknown as CsrSectionClaimReceipts;
  return { schema: CSR_CLAIM_RECEIPTS_SCHEMA, programId: v.programId, runId: v.runId, studyId: v.studyId, sectionNumber: v.sectionNumber,
    evidenceDigest: v.evidenceDigest, sourceSha256: v.sourceSha256, outputSha256: v.outputSha256,
    claims: v.claims.map(c => ({ table: c.table, row: c.row, column: c.column, value: c.value, endpoint: c.endpoint, population: c.population })) };
}

/**
 * The evidence an import carries for one saved job section, or null when the
 * section has no receipts, or they were not made for this exact output text.
 * `storedCopy` is the Authoring section text the import writes; the binding is
 * to its hash, so any later edit of the section is detected.
 */
export function importedCsrSectionEvidence(
  row: { sectionNumber: string; content: string; contentHash: string; lineage: unknown },
  storedCopy: string, studyInfo: unknown,
): CsrImportedSectionEvidence | null {
  const lineage = object(row.lineage) ? row.lineage : {};
  const receipts = parseCsrClaimReceipts(lineage.claimReceipts);
  if (!receipts || receipts.sectionNumber !== row.sectionNumber || receipts.outputSha256 !== row.contentHash ||
    sha(row.content) !== row.contentHash) return null;
  const claimed = receipts.claims.map(c => c.value);
  const notClaimed = findUnclaimedNumbers(row.content, { claimed }).map(n => n.text);
  const notSupplied = new Set(findUnclaimedNumbers(row.content, { claimed, studyInfo }).map(n => n.text));
  return { ...receipts, sectionSha256: sha(storedCopy),
    studyInformationNumbers: notClaimed.filter(n => !notSupplied.has(n)).sort() };
}

/** A CSR section's imported evidence read back from a saved Authoring document; malformed is null. */
export function parseImportedCsrSectionEvidence(value: unknown): CsrImportedSectionEvidence | null {
  const receipts = parseCsrClaimReceipts(value);
  if (!receipts || !object(value)) return null;
  const { sectionSha256, studyInformationNumbers } = value;
  if (!text(sectionSha256) || !HASH.test(sectionSha256) || !Array.isArray(studyInformationNumbers) ||
    studyInformationNumbers.length > 500 || !studyInformationNumbers.every(n => text(n, 40))) return null;
  return { ...receipts, sectionSha256, studyInformationNumbers: [...studyInformationNumbers] };
}
