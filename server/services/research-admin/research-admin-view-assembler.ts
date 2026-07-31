/**
 * Assemble the v2 ResearchAdmin surface's Training-section render contract from the
 * REAL, org-scoped research-compliance roster — research_personnel (who is on the
 * org's studies) + personnel_training (their CITI/clearance completion records) —
 * the exact tables the roster service (createPersonnelTx / addTrainingTx), the CITI
 * bulk-import (importCitiRecordsTx) and AnA's training tools write. NOT the
 * seed-only c2c_research_admin blob.
 *
 * The surface renders one row per person ({ id, name, role, cells[] }) where
 * cells[] is the per-module CITI status vector aligned to the surface's fixed
 * column order (Human Subjects, GCP, IACUC, Biosafety/IBC, COI — see
 * CITI_COLUMN_TYPES below). The blob stored that vector as a JSONB literal; here
 * every cell is DERIVED live from the person's real training records with the same
 * pure status logic the CITI service uses (citi-logic trainingStatus, 60-day
 * expiring window):
 *   completed, expiry beyond the window        → 'current'
 *   completed, expiring within 60 days         → 'expiring'
 *   completed, past its expiry                 → 'expired'
 *   record on file with no completion date     → 'missing' (assigned, not done)
 *   no record of that training type at all     → 'n/a' (surface renders '—')
 * The store carries no per-person requiredness model, so an absent record is shown
 * as the honest empty cell ('n/a'), never asserted as a compliance failure. When a
 * person holds multiple records of one type (recertifications), the latest
 * completion governs.
 *
 * `role` is the roster's CHECK-constrained vocabulary rendered with its standard
 * short label ('PI', 'Co-I', …) — presentation of a real enum, never fabricated;
 * an unknown token falls through verbatim. Rows sort by full_name (the roster
 * service's canonical order). Bulk (two queries), org-scoped on both tables,
 * soft-delete aware on both. An org with no roster returns [] and the surface
 * renders its honest empty state.
 */
import { pool } from '../../db';
import { trainingStatus } from '../citi/citi-logic';

/**
 * The surface's CITI training columns, in render order, each mapped to its
 * personnel_training.training_type. Must stay aligned with CITI_TRAININGS in
 * client/src/concept2cure/v2/surfaces/ResearchAdmin.tsx:
 *   0 Human Subjects (Biomed)        → citi_human_subjects
 *   1 GCP                            → citi_gcp
 *   2 IACUC (Working with Animals)   → citi_animal
 *   3 Biosafety / IBC                → biosafety
 *   4 Conflict of Interest           → fcoi_disclosure
 */
export const CITI_COLUMN_TYPES = [
  'citi_human_subjects',
  'citi_gcp',
  'citi_animal',
  'biosafety',
  'fcoi_disclosure',
] as const;

/** research_personnel.role (CHECK-constrained) → the surface's short display label. */
const ROLE_LABEL: Record<string, string> = {
  principal_investigator: 'PI',
  co_investigator: 'Co-I',
  coordinator: 'Coordinator',
  research_staff: 'Research staff',
  veterinarian: 'Veterinarian',
  biosafety_officer: 'Biosafety officer',
  other: 'Other',
};

interface PersonnelRow {
  id: number;
  full_name: string | null;
  role: string | null;
}

interface TrainingRow {
  personnel_id: number;
  training_type: string;
  completed_date: string | null;
  expires_date: string | null;
}

/**
 * Assemble the org's CITI training matrix — one row per live roster member, cells
 * derived from their live training records. `today` (ISO date) is injectable so the
 * derivation is deterministic under test; it defaults to the current UTC date.
 */
export async function assembleOrgResearchAdmin(
  orgId: number,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<Record<string, unknown>[]> {
  const personnelRes = await pool.query(
    `SELECT id, full_name, role
       FROM research_personnel
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY full_name, id`,
    [orgId],
  );
  const personnel = personnelRes.rows as PersonnelRow[];
  if (personnel.length === 0) return [];

  // Every live training record for the rendered CITI columns, ascending by
  // completion so that map-overwrite leaves the LATEST completion governing each
  // (person, type) cell (a dated record always supersedes an undated assignment).
  const trainingRes = await pool.query(
    `SELECT personnel_id, training_type,
            completed_date::text AS completed_date,
            expires_date::text   AS expires_date
       FROM personnel_training
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND training_type = ANY($2::text[])
      ORDER BY completed_date ASC NULLS FIRST, expires_date ASC NULLS FIRST, id ASC`,
    [orgId, [...CITI_COLUMN_TYPES]],
  );
  const governing = new Map<string, { completed: string | null; expires: string | null }>();
  for (const r of trainingRes.rows as TrainingRow[]) {
    governing.set(`${r.personnel_id}:${r.training_type}`, {
      completed: r.completed_date,
      expires: r.expires_date,
    });
  }

  return personnel.map((p) => ({
    id: String(p.id),
    name: p.full_name ?? null,
    role: p.role == null ? null : (ROLE_LABEL[p.role] ?? p.role),
    cells: CITI_COLUMN_TYPES.map((type) => {
      const rec = governing.get(`${p.id}:${type}`);
      return rec ? trainingStatus(rec.completed, rec.expires, today) : 'n/a';
    }),
  }));
}
