/**
 * The protocol view's register mappers: review comments and assignments,
 * amendments and deviations, as the protocol workspace reads them. Split out
 * of pdev-view-assembler.ts (which imports them) to keep that file within the
 * lint budget; nothing here reads the database.
 */
import type { PdevSignatureFacet } from './protocol-signature-manifestation';
import { dispositionTarget } from './protocol-signature-manifestation';
import { nextAmendmentStatuses } from '../protocol-amendments/protocol-amendments-service';
import {
  evaluateCapaClosure, isAssessed,
  type CapaActionStatus, type DeviationSeverity, type DeviationStatus,
} from '../protocol-deviations/protocol-deviations-logic';

const str = (v: unknown): string => (v == null ? '' : String(v));
const bool = (v: unknown): boolean => v === true || v === 't' || v === 'true';

/** The protocol's review comments. They belong to the protocol, not to a
 *  reviewer: `protocol_review_comments` is keyed by document. They were copied
 *  onto every assignment, so the pane, which flattens the assignments, showed
 *  each comment once per reviewer and none at all before a review was asked. */
export function mapReviewComments(comments: Record<string, unknown>[]): unknown[] {
  return comments.map((c) => ({
    id: str(c.id), sec: str(c.section_ref), sev: str(c.severity), text: str(c.comment), resolved: bool(c.resolved),
  }));
}

/** Review assignments. Extracted for the lint budget. */
export function mapReviews(
  rows: Record<string, unknown>[],
  signatureOf: (target: string) => PdevSignatureFacet,
): unknown[] {
  return rows.map((rv) => ({
    id: str(rv.id), reviewer: str(rv.reviewer_name), role: str(rv.role), status: str(rv.status),
    // Who may sign the disposition: that user, or (null) anyone taking
    // responsibility for recording a reviewer who has no account.
    reviewerUserId: rv.reviewer_user_id == null ? null : Number(rv.reviewer_user_id),
    disposition: str(rv.disposition), dueDate: rv.due_date ? String(rv.due_date).slice(0, 10) : '',
    // Who signed it, from the signature row, not the assignment's label.
    signature: signatureOf(dispositionTarget(str(rv.id))),
  }));
}

/** Amendments with their change rows. Extracted so the per-document mapper
 *  stays under the size the repo's lint budget allows. */
export function mapAmendments(
  rows: Record<string, unknown>[],
  changesByAmend: Map<string, Record<string, unknown>[]>,
): unknown[] {
  const at = (id: number) => changesByAmend.get(str(id)) ?? [];
  return rows.map((a) => ({
    id: str(a.id), num: str(a.amendment_number), summary: str(a.title),
    /* The recorded lifecycle status. It was derived from the dates, which
       reported under review as submitted and approved, rejected and implemented
       all as "decided". `nextStatuses` is the server's own transition table. */
    status: str(a.status), nextStatuses: nextAmendmentStatuses(str(a.status)),
    // Re-consent is the IRB's determination (45 CFR 46.109(b); 21 CFR 56.109(b)),
    // never the engine's. true = a declared consent or risk impact means the
    // IRB must decide; null = either impact undeclared; false = both declared no.
    reconsent: reconsentIndicator(a.affects_consent, a.affects_risk), path: '',
    changes: at(Number(a.id)).map((c) => ({ sec: str(c.section_ref), from: str(c.previous_text), to: str(c.proposed_text) })),
  }));
}

function reconsentIndicator(consent: unknown, risk: unknown): boolean | null {
  if (bool(consent) || bool(risk)) return true;
  if (consent === null || consent === undefined || risk === null || risk === undefined) return null;
  return false;
}

/** Deviations with their CAPA rows. Extracted for the same reason. */
export function mapDeviations(
  rows: Record<string, unknown>[],
  capaByDev: Map<string, Record<string, unknown>[]>,
): unknown[] {
  const at = (id: number) => capaByDev.get(str(id)) ?? [];
  return rows.map((dv) => ({
    id: str(dv.id), title: str(dv.description), sev: str(dv.severity), cat: str(dv.category),
    // Assessed = severity AND safety impact recorded. Legacy rows (defaulted
    // severity, no safety assessment) read as not assessed — which they were.
    assessed: dv.severity != null && dv.affects_safety != null,
    // true = prompt IRB report indicated; false = not indicated; null = not determined.
    reportable: dv.is_reportable === null || dv.is_reportable === undefined ? null : bool(dv.is_reportable),
    status: str(dv.status),
    /* Each CAPA action's own id: it was the deviation's, so no action could be
       addressed and two actions on one deviation shared it. */
    capa: at(Number(dv.id)).map((c) => ({ id: str(c.id), action: str(c.action), status: str(c.status) })),
    /* Why it cannot be closed yet, from the same gate closeDeviationTx enforces. */
    closeBlockers: evaluateCapaClosure({
      deviationStatus: str(dv.status) as DeviationStatus,
      capaActions: at(Number(dv.id)).map((c) => ({ status: str(c.status) as CapaActionStatus })),
      assessed: isAssessed({
        severity: (dv.severity ?? null) as DeviationSeverity | null,
        affectsSafety: dv.affects_safety == null ? null : bool(dv.affects_safety),
      }),
    }).blockers,
  }));
}
