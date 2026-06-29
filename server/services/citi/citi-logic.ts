/**
 * CITI Training logic (full-integration) — PURE, DB-free, LLM-free
 *
 * The deterministic spine for CITI Program training currency: status of a
 * completion record relative to its expiry, the training required by a research
 * activity profile, the per-person training matrix, and the expiring-soon report.
 *
 * Grounded in CITI Program recertification practice and the institutional gates
 * those records satisfy — 45 CFR 46.111(a)(7) (IRB approval criteria, which the
 * institution operationalizes via documented investigator/staff human-subjects
 * training) and PHS Policy IV.C.1.f (personnel must be appropriately qualified
 * and trained for animal work). CITI human-subjects/GCP completions are commonly
 * carried on a recertification cycle (often ~3 years), so a record is treated as
 * "expiring" within 60 days of its expiry to give programs time to recertify.
 *
 * The required-by-activity mapping REUSES the shared compliance-checklist engine
 * (resolveComplianceChecklist) so the regulation-cited rule data lives in exactly
 * one place; this module only projects it down to a TrainingType[] for CITI.
 *
 * Pure and deterministic: `today` is always passed in.
 *
 * @module server/services/citi/citi-logic
 */

import type { TrainingType } from '../../../shared/schema/research-compliance';
import {
  resolveComplianceChecklist,
  type ActivityProfile,
} from '../research-compliance/compliance-checklist';

/** Default window (days) before expiry within which a record is "expiring". */
export const EXPIRING_WINDOW_DAYS = 60;

export type CitiTrainingStatus = 'current' | 'expiring' | 'expired' | 'missing';

/** Convert an ISO date (YYYY-MM-DD...) to whole UTC days since the epoch. */
function toDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000) : null;
}

/**
 * Status of a single training record. Returns 'missing' when there is no
 * completion on file, 'expired' when past its expiry, 'expiring' when within
 * `withinDays` of expiry, otherwise 'current'. A completed record with no tracked
 * expiry is 'current' (no recertification clock). Pure.
 *
 * Basis: CITI Program recertification cycle; 45 CFR 46.111 / PHS Policy IV.C.1.f
 * (the institution must confirm current, appropriate training before approval).
 */
export function trainingStatus(
  completedDate: string | null | undefined,
  expiresDate: string | null | undefined,
  today: string,
  withinDays: number = EXPIRING_WINDOW_DAYS,
): CitiTrainingStatus {
  if (!completedDate) return 'missing';
  const exp = toDays(expiresDate);
  if (exp == null) return 'current'; // completed, no expiry tracked
  const now = toDays(today);
  if (now == null) return 'current';
  if (now > exp) return 'expired';
  if (exp - now <= withinDays) return 'expiring';
  return 'current';
}

/** A research activity profile, projected to CITI's relevant inputs. */
export interface CitiActivityProfile {
  involvesHumanSubjects: boolean;
  involvesAnimals: boolean;
  involvesRecombinantDNA: boolean;
  fundingSource: ActivityProfile['fundingSource'];
}

/**
 * The training types required for an activity profile. REUSES the shared
 * compliance-checklist engine (resolveComplianceChecklist) as the single,
 * regulation-cited source of truth and projects its requiredTraining[] down to a
 * de-duplicated TrainingType[]. Pure.
 *
 * The engine yields, among others: human subjects -> citi_human_subjects (+
 * citi_gcp for non-internal funding); animals -> citi_animal; recombinant DNA ->
 * biosafety; NIH/NSF funding -> citi_rcr.
 */
export function REQUIRED_TRAINING_BY_ACTIVITY(profile: CitiActivityProfile): TrainingType[] {
  const checklist = resolveComplianceChecklist({
    involvesHumanSubjects: profile.involvesHumanSubjects,
    involvesAnimals: profile.involvesAnimals,
    involvesRecombinantDNA: profile.involvesRecombinantDNA,
    involvesHumanGeneTransfer: false,
    fundingSource: profile.fundingSource,
    region: 'us',
  });
  const seen = new Set<TrainingType>();
  const out: TrainingType[] = [];
  for (const t of checklist.requiredTraining) {
    if (!seen.has(t.trainingType)) {
      seen.add(t.trainingType);
      out.push(t.trainingType);
    }
  }
  return out;
}

// ─── Training matrix ─────────────────────────────────────────────────────────

export interface MatrixPersonnel {
  id: number;
  name: string;
  role: string;
}

export interface MatrixRecord {
  personnelId: number;
  trainingType: TrainingType | string;
  completedDate?: string | null;
  expiresDate?: string | null;
}

export interface MatrixCell {
  trainingType: TrainingType | string;
  status: CitiTrainingStatus;
  completedDate: string | null;
  expiresDate: string | null;
}

export interface MatrixRow {
  personnelId: number;
  name: string;
  role: string;
  trainings: MatrixCell[];
}

export interface MatrixSummary {
  personnel: number;
  current: number;
  expiring: number;
  expired: number;
  missing: number;
}

export interface TrainingMatrix {
  rows: MatrixRow[];
  summary: MatrixSummary;
}

/**
 * Build the per-person training matrix. Each row carries one cell per known
 * training type for that person (i.e. the training types they actually have a
 * record for); the summary tallies cell statuses across everyone. Optionally pass
 * `requiredTypes` to additionally surface required-but-missing trainings as
 * 'missing' cells. Pure and deterministic.
 */
export function buildTrainingMatrix(
  personnel: MatrixPersonnel[],
  records: MatrixRecord[],
  today: string,
  requiredTypes: ReadonlyArray<TrainingType> = [],
  withinDays: number = EXPIRING_WINDOW_DAYS,
): TrainingMatrix {
  const summary: MatrixSummary = { personnel: personnel.length, current: 0, expiring: 0, expired: 0, missing: 0 };
  const rows: MatrixRow[] = personnel.map((p) => {
    const own = records.filter((r) => r.personnelId === p.id);
    const cells: MatrixCell[] = [];
    const seen = new Set<string>();
    for (const r of own) {
      const status = trainingStatus(r.completedDate, r.expiresDate, today, withinDays);
      cells.push({ trainingType: r.trainingType, status, completedDate: r.completedDate ?? null, expiresDate: r.expiresDate ?? null });
      seen.add(String(r.trainingType));
    }
    // Surface required trainings with no record at all as 'missing'.
    for (const req of requiredTypes) {
      if (!seen.has(req)) {
        cells.push({ trainingType: req, status: 'missing', completedDate: null, expiresDate: null });
        seen.add(req);
      }
    }
    for (const c of cells) summary[c.status] += 1;
    return { personnelId: p.id, name: p.name, role: p.role, trainings: cells };
  });
  return { rows, summary };
}

// ─── Expiring-soon report ─────────────────────────────────────────────────────

export interface ExpiringRecord extends MatrixRecord {
  personnelName?: string | null;
}

export interface ExpiringResult extends ExpiringRecord {
  status: CitiTrainingStatus;
  daysUntilExpiry: number;
}

/**
 * Records that are expiring within `withinDays` (and not already expired/missing),
 * sorted soonest-first. A record with no expiry is excluded (no clock). Pure.
 */
export function expiringSoon(
  records: ExpiringRecord[],
  today: string,
  withinDays: number = EXPIRING_WINDOW_DAYS,
): ExpiringResult[] {
  const now = toDays(today);
  const out: ExpiringResult[] = [];
  for (const r of records) {
    const exp = toDays(r.expiresDate);
    if (exp == null || now == null) continue;
    const daysUntilExpiry = exp - now;
    if (daysUntilExpiry < 0) continue; // already expired, not "expiring soon"
    if (daysUntilExpiry <= withinDays) {
      out.push({ ...r, status: trainingStatus(r.completedDate, r.expiresDate, today, withinDays), daysUntilExpiry });
    }
  }
  out.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  return out;
}
