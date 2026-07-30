/**
 * Assemble the v2 SafetyNarrative surface's SAE case worklist from the REAL,
 * org-scoped pharmacovigilance store (`adverse_events`, migrations/
 * 20260603_pv_operational.sql) — the exact table pharmacovigilanceService.
 * reportAdverseEvent persists, NOT a seed-only blob.
 *
 * The surface renders one row per individual SAE case ({ id, subjectId, studyDrug,
 * dose, event{term,seriousnessCriteria,causality,outcome,…}, expectedness, … }) and
 * computes each case's 21 CFR 312.32(c) / ICH E2A expedited-reporting clock LIVE from
 * the case facts (awareness date + seriousness + causality + expectedness + outcome)
 * via the pure PV clock module. So this assembler maps the real columns and computes
 * the clock; no blob, no fabricated field. Fields the PV intake store does not carry
 * (trial demographics: age/sex/treatment arm/first-dose date, medical history,
 * concomitant meds, and the sub-event severity/day-on-study/action-taken) are honestly
 * absent — the surface renders them null-safe and its ICH E3 §16 composer flags them as
 * missing rather than inventing them.
 *
 * `adverse_events.organization_id` is TEXT and `seriousness_criteria` is a JSON array
 * round-tripped as TEXT (per the PV service), so both are handled accordingly.
 */
import { pool } from '../../db';
import { computeExpeditedReportingClock } from './expedited-reporting-clock';

const str = (v: unknown): string => (v == null ? '' : String(v));
const orUndef = (v: unknown): string | undefined => (v == null || String(v).trim() === '' ? undefined : String(v));

/** A TIMESTAMPTZ (Date or ISO string) reduced to its 'YYYY-MM-DD' calendar day, or null. */
function toDay(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
  return m ? m[1] : null;
}

/** seriousness_criteria is a JSON array stored as TEXT; parse defensively (also accepts a comma list). */
function parseCriteria(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  const s = String(v ?? '').trim();
  if (!s) return [];
  try {
    const p = JSON.parse(s);
    if (Array.isArray(p)) return p.map(String);
  } catch {
    /* not JSON — fall through to comma split */
  }
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

/**
 * Assemble the org's SAE case worklist, most-urgent first. Returns [] when the org has
 * no adverse events — the surface renders its honest empty state.
 */
export async function assembleOrgSaeCases(orgId: number, now: Date = new Date()): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query(
    `SELECT id, patient_id, project_id, event_type, event_description, onset_date, report_date,
            seriousness_criteria, causality, outcome, expectedness, reaction_pt,
            suspect_product, suspect_product_dose, narrative, regulatory_reporting_deadline, created_at
       FROM adverse_events
      WHERE organization_id = $1
      ORDER BY regulatory_reporting_deadline ASC NULLS LAST, created_at ASC, id`,
    [String(orgId)],
  );

  return (rows as Array<Record<string, unknown>>).map((r) => {
    const criteria = parseCriteria(r.seriousness_criteria);
    const awarenessDate = toDay(r.report_date);
    const reporting = computeExpeditedReportingClock(
      {
        awarenessDate,
        seriousnessCriteria: criteria,
        causality: orUndef(r.causality) ?? null,
        expectedness: orUndef(r.expectedness) ?? null,
        outcome: orUndef(r.outcome) ?? null,
      },
      now,
    );

    // Legacy display fields the surface's queue/urgency use, derived from the live clock
    // (the blob's static due/clock/due_days columns have no equivalent here).
    const clockLabel =
      reporting.category === 'none' ? 'No expedited clock' : `${reporting.category} expedited report`;
    const dueLabel = reporting.dueDate ?? (reporting.category === 'none' ? '—' : 'awaiting Day 0');
    const dueDays = reporting.daysRemaining ?? 9999;

    return {
      id: str(r.id),
      due: dueLabel,
      clock: clockLabel,
      dueDays,
      subjectId: orUndef(r.patient_id),
      age: undefined,
      sex: undefined,
      studyId: orUndef(r.project_id),
      treatmentArm: undefined,
      studyDrug: orUndef(r.suspect_product),
      dose: orUndef(r.suspect_product_dose),
      firstDoseDate: undefined,
      awarenessDate: awarenessDate ?? undefined,
      expectedness: orUndef(r.expectedness),
      medicalHistory: [],
      concomitantMeds: [],
      event: {
        term: orUndef(r.reaction_pt) ?? orUndef(r.event_description) ?? '',
        seriousnessCriteria: criteria,
        causality: orUndef(r.causality),
        outcome: orUndef(r.outcome),
        onsetDate: toDay(r.onset_date) ?? undefined,
      },
      // Live-computed expedited-reporting clock (21 CFR 312.32(c) / ICH E2A).
      reportingCategory: reporting.category,
      reportingClockStart: reporting.clockStart,
      reportingDueDate: reporting.dueDate,
      reportingDaysRemaining: reporting.daysRemaining,
      reportingOverdue: reporting.overdue,
      reportingBasis: reporting.basis,
    };
  });
}
