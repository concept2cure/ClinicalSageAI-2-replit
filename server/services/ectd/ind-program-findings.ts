/**
 * The IND program's part of a sequence's one dispatch verdict (decision P-33,
 * docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-15).
 *
 * Until P-33 a US IND sequence had two go/no-go verdicts that disagreed: this
 * assessor's, which freeze, dispatch and transmit enforce, and the IND gate's
 * (`ind-lifecycle/ind-dispatch-gate.ts`), which the IND lifecycle routes
 * answered with. The IND gate was merged here and deleted. What it checked
 * that the assessor did not is carried by this module, each as P-33 decided:
 *
 *   - CROSS_REFERENCE_LOA_MISSING (error, one per reference) — a file the IND
 *     relies on, recorded in its cross-reference register with no Letter of
 *     Authorization on file, blocks EVERY sequence of the IND, as the IND gate
 *     did. FDA cannot review a referenced file without its holder's written
 *     authorization (21 CFR 312.23(b); for a Drug Master File, 314.420(b)). A
 *     register that cannot be read blocks too, and says why.
 *   - IND_SAFETY_REPORT_OVERDUE (warning, never a block) — an unfiled IND
 *     safety report past its 312.32(c) deadline. FDA does not refuse an
 *     amendment for a late safety report, and a sequence that carries the
 *     safety report itself is never warned for its own lateness.
 *   - CLINICAL_HOLD_NOT_ASSESSED (info) — nothing on the server records a
 *     312.42 clinical hold, so every US IND sequence says, visibly, that the
 *     verdict does not cover one. The IND gate read the hold from the request
 *     body and blocked every sequence whose caller did not describe it —
 *     including the complete response that lifts a hold (312.42(e)).
 *     `clinicalHoldState` is the seam a hold register plugs into.
 *   - MISSING_REQUIRED_SECTION (error) for a CONTINUING sequence — its Module 1
 *     transmittal pair (Form FDA 1571 at 1.1, cover letter at 1.2) and the
 *     content its type requires, from the same `validateSequenceLeaves` /
 *     `filingTypeForSequence` the IND routes used, imported, not copied.
 *
 * Not carried, on purpose (P-33): "already dispatched" — transmit requires a
 * dispatched sequence with a clear gate, so it would make transmit
 * unreachable; and "missing checksums" — the governed leaf route cannot set
 * the column and the packager computes checksums from the bytes, so it would
 * refuse every sequence the product builds. Both are pinned by guard tests.
 *
 * The rules are pure. The two register reads are DB-bound and tenant-scoped,
 * and a read that fails is never reported as an empty register.
 *
 * @module server/services/ectd/ind-program-findings
 */

import { canonicalRegionOf } from '../../../shared/regulatory/region-identity.js';
import {
  validateSequenceLeaves,
  filingTypeForSequence,
  IND_SAFETY_REPORT_SECTION,
  type SequenceFilingType,
  type MissingRequiredSection,
} from '../ind-lifecycle/ind-sequence-validation';
import { getCrossReferenceRegister } from '../ind-lifecycle/ind-cross-reference-persistence';
import type { CrossReferenceRegister } from '../ind-lifecycle/ind-cross-reference-service';
import { listOverdueSafetyReports } from '../ind-lifecycle/ind-safety-report-persistence';
import type { DispatchReadinessReport, Module3CrossReference, ReadinessFinding } from './dispatch-readiness';

/** A US IND: the application kind the IND program's rules apply to. */
export function isUsIndApplication(region: string, applicationType: string | null | undefined): boolean {
  return canonicalRegionOf(region) === 'US' && String(applicationType ?? '').trim().toLowerCase() === 'ind';
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const unprefixed = (code: string): string => code.trim().replace(/^m/i, '');

// ── Cross-references and Letters of Authorization ──────────────────────────

/** The submission's cross-reference register, or why it could not be read. */
export interface CrossReferenceRead {
  register: CrossReferenceRegister | null;
  error: string | null;
}

/**
 * Read the IND's cross-reference register (ind_cross_references, the Module
 * 1.4 register the LOA filing route marks) through its own reader,
 * tenant-scoped. A register that cannot be read is returned as null with the
 * reason — never as an empty register, which would read as "nothing is
 * referenced".
 */
export async function readCrossReferenceRegister(submissionId: number, organizationId: number): Promise<CrossReferenceRead> {
  try {
    return { register: await getCrossReferenceRegister(submissionId, { organizationId }), error: null };
  } catch (err) {
    return { register: null, error: errorMessage(err) };
  }
}

/** The register's entries as the original IND's Module 3 check reads them; null when it could not be read. */
export function module3CrossReferencesOf(read: CrossReferenceRead): Module3CrossReference[] | null {
  if (!read.register) return null;
  return read.register.entries.map((e) => ({
    fileLabel: e.fileLabel,
    authorizedSections: Array.isArray(e.authorizedSections) ? e.authorizedSections.map(String) : [],
    loaOnFile: e.loaOnFile === true,
  }));
}

/**
 * CROSS_REFERENCE_LOA_MISSING — one blocking error per recorded reference with
 * no Letter of Authorization on file, on every sequence of the IND. An
 * unreadable register blocks with its reason: an unread register is not a
 * register with nothing missing. Pure.
 */
export function crossReferenceLoaFindings(read: CrossReferenceRead): ReadinessFinding[] {
  if (!read.register) {
    return [
      {
        severity: 'error',
        code: 'CROSS_REFERENCE_LOA_MISSING',
        sectionCode: null,
        message:
          `The IND's cross-reference register could not be read${read.error ? ` (${read.error})` : ''}, so no file this IND ` +
          'relies on can be shown to have its Letter of Authorization on file. Dispatch is blocked until it can be read.',
      },
    ];
  }
  return read.register.entries
    .filter((e) => e.loaOnFile !== true)
    .map((e) => ({
      severity: 'error' as const,
      code: 'CROSS_REFERENCE_LOA_MISSING',
      sectionCode: '1.4.1',
      message:
        `${e.fileLabel}${e.subjectName ? ` (${e.subjectName})` : ''} is recorded as a file this IND relies on, with no Letter of ` +
        'Authorization on file. FDA cannot review a referenced file in support of the IND without its holder’s written ' +
        'authorization (21 CFR 312.23(b); for a Drug Master File, 21 CFR 314.420(b)), so no sequence of this IND is ' +
        'dispatched until it is filed. File its Letter of Authorization (Module 1.4.1), or remove the reference if the IND does not rely on it.',
    }));
}

// ── Overdue IND safety reports ─────────────────────────────────────────────

/** An unfiled IND safety report past its deadline, as the register stores it. */
export interface OverdueSafetyReport {
  id: string;
  obligation: string;
  deadline: Date | string | null;
  sequenceId: number | null;
}

/** The submission's overdue IND safety reports, or why they could not be read. */
export interface OverdueSafetyReportRead {
  reports: OverdueSafetyReport[] | null;
  error: string | null;
}

/** Read the overdue IND safety reports through the register's own reader, tenant-scoped. */
export async function readOverdueSafetyReports(
  submissionId: number,
  organizationId: number,
  asOf: Date,
): Promise<OverdueSafetyReportRead> {
  try {
    const rows = await listOverdueSafetyReports(submissionId, { organizationId }, asOf);
    return {
      reports: rows.map((r) => ({ id: r.id, obligation: r.obligation, deadline: r.deadline, sequenceId: r.sequenceId ?? null })),
      error: null,
    };
  } catch (err) {
    return { reports: null, error: errorMessage(err) };
  }
}

/** Whether the sequence carries an IND safety report itself (a 312.32 filing, or a leaf at 1.12.4). Pure. */
export function carriesIndSafetyReport(
  sequenceType: string | null,
  leaves: ReadonlyArray<{ sectionCode: string; documentType?: string | null }>,
): boolean {
  const at = unprefixed(IND_SAFETY_REPORT_SECTION).toLowerCase();
  return (
    filingTypeForSequence(sequenceType, leaves) === 'safety_report' ||
    leaves.some((l) => {
      const c = unprefixed(l.sectionCode).toLowerCase();
      return c === at || c.startsWith(`${at}.`);
    })
  );
}

const OBLIGATION_LABEL: Readonly<Record<string, string>> = Object.freeze({
  SEVEN_DAY: '7-day',
  FIFTEEN_DAY: '15-day',
});

function deadlineText(deadline: Date | string | null): string {
  if (deadline === null) return 'by a deadline not recorded';
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  return Number.isNaN(d.getTime()) ? `by ${String(deadline)}` : `by ${d.toISOString().slice(0, 10)}`;
}

/**
 * IND_SAFETY_REPORT_OVERDUE — a warning per overdue report, never a block.
 * Not emitted against a sequence that carries the safety report itself, nor
 * for a report already linked to this sequence: a safety-report sequence is
 * never refused, or warned, for its own lateness. Pure.
 */
export function overdueSafetyReportFindings(
  read: OverdueSafetyReportRead,
  sequence: { id: number; carriesSafetyReport: boolean },
): ReadinessFinding[] {
  if (sequence.carriesSafetyReport) return [];
  if (!read.reports) {
    return [
      {
        severity: 'warning',
        code: 'IND_SAFETY_REPORT_OVERDUE',
        sectionCode: null,
        message:
          `The IND safety-report register could not be read${read.error ? ` (${read.error})` : ''}, so whether an IND safety ` +
          'report is past its deadline is not known. This does not block dispatch.',
      },
    ];
  }
  return read.reports
    .filter((r) => r.sequenceId !== sequence.id)
    .map((r) => ({
      severity: 'warning' as const,
      code: 'IND_SAFETY_REPORT_OVERDUE',
      sectionCode: null,
      message:
        `A ${OBLIGATION_LABEL[r.obligation] ?? r.obligation} IND safety report was due ${deadlineText(r.deadline)} and is not filed ` +
        '(21 CFR 312.32(c)). File it in its own safety-report sequence. It does not block this sequence: FDA does not refuse ' +
        'an amendment for a late safety report.',
    }));
}

// ── Clinical hold (21 CFR 312.42) ──────────────────────────────────────────

/** What the platform knows about a clinical hold on this IND. Today: nothing. */
export interface ClinicalHoldState {
  assessed: false;
  note: string;
}

export const CLINICAL_HOLD_NOT_ASSESSED_NOTE =
  'Clinical hold (21 CFR 312.42) is not assessed: nothing on this platform records whether FDA has placed this IND on ' +
  'clinical hold, so this verdict neither clears nor blocks the sequence on that ground. Confirm the IND is not on hold ' +
  'before dispatch; the complete response to a hold (312.42(e)) is filed as a response sequence.';

/**
 * The clinical-hold state of the IND — THE SEAM for a hold register (P-33).
 *
 * Nothing on the server records a hold, so this always answers "not
 * assessed", and that is shown on every US IND sequence without blocking. It
 * must never be read from a request body: the IND gate did, and blocked every
 * sequence its caller did not describe.
 *
 * When a hold register exists, it is read HERE, and an active hold blocks
 * dispatch of every sequence of the IND except a response (filing type
 * 'response' — the complete response that asks FDA to lift the hold, 21 CFR
 * 312.42(e)), as an error finding catalogued in the rule corpus beside
 * CLINICAL_HOLD_NOT_ASSESSED. Until then no such finding exists, so the corpus
 * claims no enforcement it does not perform.
 */
export function clinicalHoldState(): ClinicalHoldState {
  return { assessed: false, note: CLINICAL_HOLD_NOT_ASSESSED_NOTE };
}

/** CLINICAL_HOLD_NOT_ASSESSED — an info finding, shown and never blocking. Pure. */
export function clinicalHoldFindings(state: ClinicalHoldState): ReadinessFinding[] {
  return [
    {
      severity: 'info',
      code: 'CLINICAL_HOLD_NOT_ASSESSED',
      sectionCode: null,
      message: state.note,
    },
  ];
}

// ── Continuing-sequence completeness ───────────────────────────────────────

const FILING_LABEL: Readonly<Record<SequenceFilingType, string>> = Object.freeze({
  initial: 'an original IND',
  amendment: 'an amendment',
  safety_report: 'an IND safety report',
  annual: 'an annual report',
  response: 'a response',
  withdrawal: 'a withdrawal',
});

function completenessFinding(m: MissingRequiredSection, filingType: SequenceFilingType, sequenceType: string | null): ReadinessFinding {
  const code = unprefixed(m.code);
  const alternatives = m.alternatives?.length ? ` — a leaf at or under any of ${m.alternatives.map(unprefixed).join(', ')} satisfies it` : '';
  const basis =
    filingType === 'initial'
      ? `Its sequence type "${sequenceType ?? ''}" is not one the IND sequence validator knows, so it is held to the original IND's required set (it fails closed on an unknown type).`
      : `A continuing IND sequence — this one is ${FILING_LABEL[filingType]} — carries the Module 1 transmittal pair, the Form FDA 1571 ` +
        `at 1.1 and the cover letter at 1.2, and the content its type exists to carry (${m.regulatoryRef}).`;
  return {
    severity: 'error',
    code: 'MISSING_REQUIRED_SECTION',
    sectionCode: code,
    message:
      `Required section ${code} (${m.title}) has no leaf in this sequence${alternatives}. ${basis} ` +
      'It cannot be validated, frozen or dispatched without it.',
  };
}

/**
 * MISSING_REQUIRED_SECTION for a continuing US IND sequence: what
 * `validateSequenceLeaves` requires of the filing type `filingTypeForSequence`
 * gives it — 1.1, 1.2 and the type's content. A delete carries no content, so
 * it satisfies nothing. Pure.
 */
export function continuingIndCompletenessFindings(
  sequence: { type: string | null },
  leaves: ReadonlyArray<{ sectionCode: string; lifecycleOp: string; documentType?: string | null }>,
): { filingType: SequenceFilingType; findings: ReadinessFinding[] } {
  const filingType = filingTypeForSequence(sequence.type, leaves);
  const report = validateSequenceLeaves({
    filingType,
    leaves: leaves.filter((l) => l.lifecycleOp !== 'delete').map((l) => ({ sectionCode: l.sectionCode })),
  });
  return { filingType, findings: report.missing.map((m) => completenessFinding(m, filingType, sequence.type)) };
}

// ── The IND program, composed ──────────────────────────────────────────────

/** The IND program's inputs to the verdict, as the assessment reports them. */
export interface IndProgramView {
  /** Recorded cross-references with no LOA on file (each blocks); null when the register could not be read. */
  crossReferencesWithoutLoa: number | null;
  /** Unfiled IND safety reports past deadline (warnings); null when the register could not be read. */
  overdueSafetyReports: number | null;
  /** The sequence carries an IND safety report itself, so lateness is not warned against it. */
  carriesSafetyReport: boolean;
  /** The IND validator's filing type for a continuing sequence; null for an original. */
  continuingFilingType: SequenceFilingType | null;
  clinicalHold: ClinicalHoldState;
}

/**
 * Everything the IND program adds to one US IND sequence's assessment; null
 * when the sequence is not a US IND's (the assessor reads the cross-reference
 * register for a US IND only, so a null register read means "not one").
 * `asOf` is the assessment's filing day (YYYY-MM-DD): a safety report is
 * overdue when its deadline is before that day begins; absent, now.
 */
export async function assessIndProgram(input: {
  sequence: { id: number; submissionId: number; type: string | null };
  leaves: ReadonlyArray<{ sectionCode: string; lifecycleOp: string; documentType?: string | null }>;
  isOriginalSequence: boolean;
  organizationId: number;
  crossReferences: CrossReferenceRead | null;
  asOf?: string;
}): Promise<{ findings: ReadinessFinding[]; view: IndProgramView } | null> {
  const { sequence, leaves, crossReferences } = input;
  if (!crossReferences) return null;
  const continuing = input.isOriginalSequence ? null : continuingIndCompletenessFindings(sequence, leaves);
  const asOf = input.asOf ? new Date(`${input.asOf}T00:00:00.000Z`) : new Date();
  const overdue = await readOverdueSafetyReports(sequence.submissionId, input.organizationId, asOf);
  const carriesSafetyReport = carriesIndSafetyReport(sequence.type, leaves);
  const hold = clinicalHoldState();
  return {
    findings: [
      ...(continuing?.findings ?? []),
      ...crossReferenceLoaFindings(crossReferences),
      ...overdueSafetyReportFindings(overdue, { id: sequence.id, carriesSafetyReport }),
      ...clinicalHoldFindings(hold),
    ],
    view: {
      crossReferencesWithoutLoa: crossReferences.register ? crossReferences.register.counts.missingLoa : null,
      overdueSafetyReports: overdue.reports ? overdue.reports.length : null,
      carriesSafetyReport,
      continuingFilingType: continuing?.filingType ?? null,
      clinicalHold: hold,
    },
  };
}

/** Add findings to a readiness report and recount it, so `errors` — the gate's input — includes them. */
export function appendReadinessFindings(report: DispatchReadinessReport, findings: ReadinessFinding[]): void {
  report.findings.push(...findings);
  report.errors = report.findings.filter((f) => f.severity === 'error').length;
  report.warnings = report.findings.filter((f) => f.severity === 'warning').length;
  report.infos = report.findings.filter((f) => f.severity === 'info').length;
  report.releaseBlockers = report.findings.filter((f) => f.blocksRelease === true).length;
}
