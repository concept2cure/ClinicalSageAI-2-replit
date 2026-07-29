/**
 * gsprConformityMatrix — E7: GSPR (EU MDR Annex I) conformity-matrix exporter.
 *
 * Produces a tech-file-ready GSPR conformity table for the 23 General Safety
 * and Performance Requirements of EU MDR 2017/745, Annex I, and the inputs that
 * drive AnA's document-surgery loop for it:
 *
 *   1. {@link MDR_ANNEX_I_GSPR_CHECKLIST} — the canonical 23-clause checklist
 *      (the stored requirement set the generated table is verified against).
 *   2. {@link renderGsprConformityMarkdown} — renders the conformity matrix as
 *      `author_docx_native`-ready markdown (pipe-delimited table) from a typed
 *      device GSPR input shape.
 *   3. {@link deriveRequiredStrings} — derives the `required_strings` for
 *      `verify_docx_against_source` from the checklist, so the VerificationPanel
 *      proves every required clause row is present before download — no
 *      requirement can be silently dropped.
 *   4. {@link buildGsprConformityAuthoringPlan} — packages (1)–(3) into a single
 *      plan AnA's tools consume.
 *
 * Honesty contract (21 CFR Part 11 / EU MDR regulated path): a matrix whose
 * applicability is `not_assessed`, or any matrix flagged as `isSample`, is NOT
 * sealable/exportable. {@link assertExportable} is the guard the download path
 * calls; the affordance disables export when it would throw.
 *
 * This module is intentionally pure (no React, no I/O) so the checklist
 * completeness, required-strings derivation, rendering, and the
 * non-exportable guard are all unit-testable in isolation.
 *
 * BUILD-1 INTEGRATION: when Build 1 lands, the exported matrix (markdown +
 * required-strings + the resolved device rows) should persist as a version row
 * keyed to the device/program so the conformity matrix can be re-exported
 * deterministically and diffed across versions. See
 * {@link GsprConformityAuthoringPlan} — its `matrixMarkdown`, `requiredStrings`,
 * and `rows` are the payload to persist. The persistence call is left out here
 * because the versioning store is owned by Build 1.
 *
 * @module client/src/concept2cure/components/ana/gsprConformityMatrix
 */

/** Applicability decision for a single GSPR clause, per program. */
export type GsprApplicability = 'applicable' | 'not_applicable' | 'not_assessed';

/**
 * One canonical EU MDR 2017/745 Annex I GSPR clause. `clause` is the Annex I
 * numbering (top-level only — the 23 numbered requirements); `id` is the stable
 * identifier used as the verification anchor and the matrix row key.
 */
export interface GsprChecklistItem {
  /** Stable identifier, e.g. 'GSPR-1'. Used as the verify required-string. */
  id: string;
  /** EU MDR Annex I chapter: I (general), II (design/manufacture), III (info). */
  chapter: 'I' | 'II' | 'III';
  /** Annex I clause number, e.g. '1', '10', '23'. */
  clause: string;
  /** Short clause title. */
  title: string;
}

/**
 * Canonical EU MDR 2017/745, Annex I — General Safety and Performance
 * Requirements. There are exactly 23 numbered requirements across 3 chapters:
 *   Chapter I  (General requirements):         clauses 1–9
 *   Chapter II (Design and manufacture):       clauses 10–22
 *   Chapter III (Information supplied):         clause 23
 *
 * Titles are condensed from the publicly available regulation text. This is the
 * stored checklist the generated conformity table is verified against, so the
 * count (23) and the ids are load-bearing — see the completeness test.
 */
export const MDR_ANNEX_I_GSPR_CHECKLIST: readonly GsprChecklistItem[] = [
  // ── Chapter I — General requirements (1–9) ────────────────────────────────
  { id: 'GSPR-1', chapter: 'I', clause: '1', title: 'Devices to achieve intended performance and be suitable for intended purpose' },
  { id: 'GSPR-2', chapter: 'I', clause: '2', title: 'Reduction of risks as far as possible (safe design and manufacture)' },
  { id: 'GSPR-3', chapter: 'I', clause: '3', title: 'Risk management system' },
  { id: 'GSPR-4', chapter: 'I', clause: '4', title: 'Risk control measures and acceptable benefit-risk ratio' },
  { id: 'GSPR-5', chapter: 'I', clause: '5', title: 'Risks related to use error and ergonomic/use environment features' },
  { id: 'GSPR-6', chapter: 'I', clause: '6', title: 'Device performance maintained over the stated lifetime' },
  { id: 'GSPR-7', chapter: 'I', clause: '7', title: 'Performance preserved during transport and storage' },
  { id: 'GSPR-8', chapter: 'I', clause: '8', title: 'Benefits outweigh undesirable side-effects (acceptable risk)' },
  { id: 'GSPR-9', chapter: 'I', clause: '9', title: 'Devices without an intended medical purpose (Annex XVI)' },

  // ── Chapter II — Design and manufacture (10–22) ───────────────────────────
  { id: 'GSPR-10', chapter: 'II', clause: '10', title: 'Chemical, physical and biological properties' },
  { id: 'GSPR-11', chapter: 'II', clause: '11', title: 'Infection and microbial contamination' },
  { id: 'GSPR-12', chapter: 'II', clause: '12', title: 'Devices incorporating a medicinal substance' },
  { id: 'GSPR-13', chapter: 'II', clause: '13', title: 'Devices incorporating materials of biological origin' },
  { id: 'GSPR-14', chapter: 'II', clause: '14', title: 'Construction of devices and interaction with their environment' },
  { id: 'GSPR-15', chapter: 'II', clause: '15', title: 'Devices with a diagnostic or measuring function' },
  { id: 'GSPR-16', chapter: 'II', clause: '16', title: 'Protection against radiation' },
  { id: 'GSPR-17', chapter: 'II', clause: '17', title: 'Electronic programmable systems and software' },
  { id: 'GSPR-18', chapter: 'II', clause: '18', title: 'Active devices and devices connected to them' },
  { id: 'GSPR-19', chapter: 'II', clause: '19', title: 'Particular requirements for active implantable devices' },
  { id: 'GSPR-20', chapter: 'II', clause: '20', title: 'Protection against mechanical and thermal risks' },
  { id: 'GSPR-21', chapter: 'II', clause: '21', title: 'Protection against risks posed by devices delivering energy or substances' },
  { id: 'GSPR-22', chapter: 'II', clause: '22', title: 'Protection against the risks posed to/by devices for lay use' },

  // ── Chapter III — Information supplied with the device (23) ────────────────
  { id: 'GSPR-23', chapter: 'III', clause: '23', title: 'Label and instructions for use' },
] as const;

/** The number of GSPRs in EU MDR 2017/745 Annex I. Load-bearing constant. */
export const MDR_ANNEX_I_GSPR_COUNT = 23;

/**
 * A device's stored decision for one GSPR clause. Keyed by `id` to a checklist
 * item. `applicability === 'applicable'` requires a method + at least one
 * evidence reference for a conformant row; `not_applicable` requires a
 * justification; `not_assessed` is the un-decided default and blocks export.
 *
 * INTEGRATION: in production these rows are joined from the device's stored
 * GSPR program mappings (shared/schema/gspr-postmarket — gsprProgramMappings:
 * applicability, methodOfDemonstration, primaryEvidenceId, rationale). The
 * server's mapping vocabulary ('applies' | 'not_applicable' | 'partial' | 'tbd')
 * maps onto this client shape as: applies→applicable, not_applicable→
 * not_applicable, tbd/unmapped→not_assessed. This module is driven from the
 * typed input shape so the matrix + verification + tests are fully exercisable
 * with fixture data ahead of that join.
 */
export interface GsprDeviceRow {
  /** Matches a {@link GsprChecklistItem.id}. */
  id: string;
  applicability: GsprApplicability;
  /** Method of conformity, e.g. 'EN ISO 14971:2019 risk management file'. */
  method?: string;
  /** Evidence references (document ids / titles) supporting conformity. */
  evidenceRefs?: string[];
  /** Justification — required for not_applicable; shown for not_assessed. */
  justification?: string;
}

/** Input to the matrix generator: the device identity + its per-clause rows. */
export interface GsprMatrixInput {
  deviceName: string;
  /** Per-clause decisions, keyed by checklist id. Missing → not_assessed. */
  rows: GsprDeviceRow[];
  /**
   * True for demonstration / fixture data. A sample matrix is never sealable
   * or exportable, regardless of applicability completeness (honesty contract).
   */
  isSample?: boolean;
}

/** Em-dash placeholder for an empty cell (never a blank a reviewer mis-reads). */
const EMPTY_CELL = '—';

/** Escape a value for a markdown pipe-table cell (pipes + newlines). */
function cell(value: string | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return EMPTY_CELL;
  return v.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Human-readable applicability label for the rendered table. */
function applicabilityLabel(a: GsprApplicability): string {
  switch (a) {
    case 'applicable':
      return 'Applicable';
    case 'not_applicable':
      return 'Not applicable';
    case 'not_assessed':
    default:
      return 'Not assessed';
  }
}

/**
 * Resolve the device rows against the canonical checklist, in checklist order,
 * so the matrix always has exactly 23 rows and never drops or reorders a
 * requirement. A clause with no stored row resolves to `not_assessed`.
 */
export function resolveMatrixRows(
  input: GsprMatrixInput,
): Array<GsprChecklistItem & { row: GsprDeviceRow }> {
  const byId = new Map(input.rows.map(r => [r.id, r]));
  return MDR_ANNEX_I_GSPR_CHECKLIST.map(item => {
    const row = byId.get(item.id) ?? { id: item.id, applicability: 'not_assessed' as const };
    return { ...item, row };
  });
}

/**
 * Render the GSPR conformity matrix as `author_docx_native`-ready markdown — a
 * heading + a pipe-delimited table with one row per Annex I clause. Each row is
 * anchored by its `id` (e.g. "GSPR-1") so verification can prove the row exists.
 *
 * Columns: Requirement (id + clause) · Title · Applicability · Method of
 * conformity · Evidence. Always emits all 23 rows in canonical order.
 */
export function renderGsprConformityMarkdown(input: GsprMatrixInput): string {
  const resolved = resolveMatrixRows(input);
  const lines: string[] = [];

  lines.push(`# GSPR Conformity Matrix — ${input.deviceName}`);
  lines.push('');
  lines.push(
    'Conformity assessment against EU MDR 2017/745, Annex I — General Safety and Performance Requirements.',
  );
  if (input.isSample) {
    lines.push('');
    lines.push('SAMPLE — not for submission. This matrix uses demonstration data and cannot be sealed or exported.');
  }
  lines.push('');
  lines.push('| Requirement | Title | Applicability | Method of conformity | Evidence |');
  lines.push('|---|---|---|---|---|');

  for (const item of resolved) {
    const { row } = item;
    const requirement = `${item.id} (Annex I, §${item.clause})`;
    const method = row.applicability === 'applicable' ? cell(row.method) : EMPTY_CELL;
    const evidence =
      row.applicability === 'applicable' ? cell((row.evidenceRefs ?? []).join('; ')) : EMPTY_CELL;
    // not_applicable surfaces its justification in the method column so the
    // reviewer sees why the clause was excluded.
    const methodCell =
      row.applicability === 'not_applicable' ? cell(row.justification) : method;
    lines.push(
      `| ${cell(requirement)} | ${cell(item.title)} | ${applicabilityLabel(row.applicability)} | ${methodCell} | ${evidence} |`,
    );
  }

  return lines.join('\n');
}

/**
 * Derive the `required_strings` for `verify_docx_against_source` from the
 * canonical checklist — the requirement identifiers every conformity table MUST
 * contain verbatim. If any row was dropped, verification fails and the
 * VerificationPanel surfaces the missing clause id. Always returns 23 strings
 * in canonical order, regardless of the device's decisions.
 */
export function deriveRequiredStrings(): string[] {
  return MDR_ANNEX_I_GSPR_CHECKLIST.map(item => item.id);
}

/** Reasons a conformity matrix cannot be sealed/exported (honesty contract). */
export type GsprExportBlock =
  | { exportable: true }
  | { exportable: false; reason: 'sample' | 'not_assessed'; message: string; clauseIds?: string[] };

/**
 * Evaluate whether a matrix may be sealed/exported. A matrix is blocked when it
 * is flagged as a sample, or when any in-scope clause is still `not_assessed`.
 * Pure — the affordance reads this to disable export, and the download path
 * asserts on it.
 */
export function evaluateExportability(input: GsprMatrixInput): GsprExportBlock {
  if (input.isSample) {
    return {
      exportable: false,
      reason: 'sample',
      message: 'Sample matrix — not sealable or exportable. Use device data to export.',
    };
  }
  const resolved = resolveMatrixRows(input);
  const notAssessed = resolved.filter(r => r.row.applicability === 'not_assessed');
  if (notAssessed.length > 0) {
    return {
      exportable: false,
      reason: 'not_assessed',
      message: `${notAssessed.length} requirement${notAssessed.length === 1 ? '' : 's'} not assessed — assess every clause before export.`,
      clauseIds: notAssessed.map(r => r.id),
    };
  }
  return { exportable: true };
}

/** Thrown by {@link assertExportable} when a matrix may not be exported. */
export class GsprNotExportableError extends Error {
  readonly reason: 'sample' | 'not_assessed';
  readonly clauseIds?: string[];
  constructor(block: Extract<GsprExportBlock, { exportable: false }>) {
    super(block.message);
    this.name = 'GsprNotExportableError';
    this.reason = block.reason;
    this.clauseIds = block.clauseIds;
  }
}

/**
 * Guard the export path: throws {@link GsprNotExportableError} when the matrix
 * is a sample or has un-assessed clauses, so a sample/incomplete conformity
 * table can never be sealed or downloaded.
 */
export function assertExportable(input: GsprMatrixInput): void {
  const block = evaluateExportability(input);
  if (!block.exportable) throw new GsprNotExportableError(block);
}

/**
 * A complete authoring plan AnA drives: the rendered matrix markdown for
 * `author_docx_native`, the `required_strings` for the auto-run
 * `verify_docx_against_source`, the resolved rows, the export verdict, and a
 * document title. Pure — the affordance and any server orchestration consume it.
 */
export interface GsprConformityAuthoringPlan {
  title: string;
  matrixMarkdown: string;
  requiredStrings: string[];
  rows: Array<GsprChecklistItem & { row: GsprDeviceRow }>;
  export: GsprExportBlock;
}

/** Build the full GSPR conformity authoring plan from a device's GSPR input. */
export function buildGsprConformityAuthoringPlan(
  input: GsprMatrixInput,
): GsprConformityAuthoringPlan {
  return {
    title: `GSPR Conformity Matrix — ${input.deviceName}`,
    matrixMarkdown: renderGsprConformityMarkdown(input),
    requiredStrings: deriveRequiredStrings(),
    rows: resolveMatrixRows(input),
    export: evaluateExportability(input),
  };
}
