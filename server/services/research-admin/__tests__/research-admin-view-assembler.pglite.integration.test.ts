/**
 * assembleOrgResearchAdmin — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: a roster persisted in the REAL research-compliance store
 * (research_personnel + personnel_training, with their CHECK-constrained role /
 * training_type vocabularies) is assembled into exactly the { id, name, role,
 * cells[] } rows the v2 ResearchAdmin Training matrix renders — every cell DERIVED
 * live from real completion/expiry dates via citi-logic's 60-day window ('current'
 * / 'expiring' / 'expired'), an undated record honestly 'missing', an absent
 * record honestly 'n/a', the best current standing governing recertified modules
 * (a valid longer-dated cert is never masked by a lapsed refresher) — with strict
 * INTEGER org scope and soft-delete awareness on both tables.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { assembleOrgResearchAdmin } from '../research-admin-view-assembler';

const ORG = 7;
const OTHER = 9;
const TODAY = '2026-07-30';

// Mirrors migrations/20260611_research_compliance.sql (FKs to organizations/users
// dropped for the in-process store; the CHECK vocabularies are kept so the test
// can only insert values the real store accepts).
const DDL = `
CREATE TABLE research_personnel (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL,
  user_id         integer,
  full_name       text NOT NULL,
  email           text,
  role            text NOT NULL CHECK (role IN ('principal_investigator','co_investigator','coordinator','research_staff','veterinarian','biosafety_officer','other')),
  institution     text,
  created_by      integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE TABLE personnel_training (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL,
  personnel_id    integer NOT NULL REFERENCES research_personnel(id),
  training_type   text NOT NULL CHECK (training_type IN
                    ('citi_human_subjects','citi_gcp','citi_animal','citi_rcr','biosafety','bloodborne_pathogens','iata_shipping','hipaa','fcoi_disclosure','other')),
  completed_date  date,
  expires_date    date,
  certificate_ref text,
  created_by      integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM personnel_training; DELETE FROM research_personnel;`); });

async function insertPerson(org: number, fullName: string, role: string): Promise<number> {
  const r = await pglite.query(
    `INSERT INTO research_personnel (organization_id, full_name, role, created_by) VALUES ($1,$2,$3,1) RETURNING id`,
    [org, fullName, role],
  );
  return (r.rows[0] as { id: number }).id;
}

async function insertTraining(
  org: number, personnelId: number, type: string,
  completed: string | null, expires: string | null,
): Promise<number> {
  const r = await pglite.query(
    `INSERT INTO personnel_training (organization_id, personnel_id, training_type, completed_date, expires_date, created_by)
     VALUES ($1,$2,$3,$4,$5,1) RETURNING id`,
    [org, personnelId, type, completed, expires],
  );
  return (r.rows[0] as { id: number }).id;
}

describe('assembleOrgResearchAdmin', () => {
  it('derives the full cell vocabulary from real dates, in the surface column order', async () => {
    const pi = await insertPerson(ORG, 'Dr. Elena Vasquez', 'principal_investigator');
    // Col 0 HS: completed, expiry far out                         → current
    await insertTraining(ORG, pi, 'citi_human_subjects', '2025-10-01', '2028-10-01');
    // Col 1 GCP: expires 2026-09-15, 47 days out (≤ 60-day window) → expiring
    await insertTraining(ORG, pi, 'citi_gcp', '2023-09-15', '2026-09-15');
    // Col 2 IACUC: no record                                      → n/a
    // Col 3 Biosafety: on file, no completion date                → missing
    await insertTraining(ORG, pi, 'biosafety', null, null);
    // Col 4 COI: past expiry                                      → expired
    await insertTraining(ORG, pi, 'fcoi_disclosure', '2023-06-30', '2025-06-30');
    // A non-CITI-column clearance never leaks into the vector.
    await insertTraining(ORG, pi, 'hipaa', '2026-01-01', '2029-01-01');

    const rows = await assembleOrgResearchAdmin(ORG, TODAY) as any[];
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.id).toBe(String(pi));                 // real serial PK, serialized
    expect(r.name).toBe('Dr. Elena Vasquez');      // full_name
    expect(r.role).toBe('PI');                     // enum → short display label
    expect(r.cells).toEqual(['current', 'expiring', 'n/a', 'missing', 'expired']);
  });

  it('lets the best current standing govern a recertified module', async () => {
    const p = await insertPerson(ORG, 'M. Delgado, RN', 'coordinator');
    // Old lapsed cert + this cycle's renewal → the renewal governs (current).
    await insertTraining(ORG, p, 'citi_human_subjects', '2020-01-01', '2023-01-01');
    await insertTraining(ORG, p, 'citi_human_subjects', '2026-01-15', '2029-01-15');
    // An undated re-assignment never masks a real completion.
    await insertTraining(ORG, p, 'citi_gcp', null, null);
    await insertTraining(ORG, p, 'citi_gcp', '2025-05-01', '2028-05-01');

    const [r] = await assembleOrgResearchAdmin(ORG, TODAY) as any[];
    expect(r.cells[0]).toBe('current');
    expect(r.cells[1]).toBe('current');
  });

  it('does not let a lapsed short refresher mask a still-valid longer-dated cert', async () => {
    const p = await insertPerson(ORG, 'M. Delgado, RN', 'coordinator');
    // A long, still-valid certificate completed EARLIER (expires 2027-06-01,
    // ~10 months out on TODAY = 'current')...
    await insertTraining(ORG, p, 'citi_human_subjects', '2024-01-01', '2027-06-01');
    // ...plus a short refresher completed LATER that has ALREADY lapsed
    // (expired 2025-09-01). Latest-completion collapse would show 'expired' and
    // wrongly flag a covered person; best-standing collapse must show 'current'.
    await insertTraining(ORG, p, 'citi_human_subjects', '2025-06-01', '2025-09-01');

    const [r] = await assembleOrgResearchAdmin(ORG, TODAY) as any[];
    expect(r.cells[0]).toBe('current');
  });

  it('labels every roster role and sorts rows by full name', async () => {
    await insertPerson(ORG, 'R. Patel', 'research_staff');
    await insertPerson(ORG, 'Dr. A. Nwosu', 'co_investigator');
    await insertPerson(ORG, 'Dr. K. Osei, DVM', 'veterinarian');
    await insertPerson(ORG, 'B. Chen', 'other');

    const rows = await assembleOrgResearchAdmin(ORG, TODAY) as any[];
    expect(rows.map((r) => r.name)).toEqual(['B. Chen', 'Dr. A. Nwosu', 'Dr. K. Osei, DVM', 'R. Patel']);
    expect(rows.map((r) => r.role)).toEqual(['Other', 'Co-I', 'Veterinarian', 'Research staff']);
    // No training records at all → an all-'n/a' vector, never a fabricated status.
    expect(rows[0].cells).toEqual(['n/a', 'n/a', 'n/a', 'n/a', 'n/a']);
  });

  it('returns [] for an org with no roster, and never crosses tenants', async () => {
    const p = await insertPerson(ORG, 'Dr. Elena Vasquez', 'principal_investigator');
    await insertTraining(ORG, p, 'citi_gcp', '2025-05-01', '2028-05-01');
    expect(await assembleOrgResearchAdmin(OTHER, TODAY)).toEqual([]);
  });

  it('is soft-delete aware on both tables', async () => {
    const gone = await insertPerson(ORG, 'Former Member', 'research_staff');
    await pglite.query(`UPDATE research_personnel SET deleted_at = now() WHERE id = $1`, [gone]);

    const p = await insertPerson(ORG, 'Dr. K. Osei, DVM', 'veterinarian');
    const rec = await insertTraining(ORG, p, 'citi_animal', '2025-05-01', '2028-05-01');
    await pglite.query(`UPDATE personnel_training SET deleted_at = now() WHERE id = $1`, [rec]);

    const rows = await assembleOrgResearchAdmin(ORG, TODAY) as any[];
    expect(rows).toHaveLength(1);                  // deleted person excluded
    expect(rows[0].name).toBe('Dr. K. Osei, DVM');
    expect(rows[0].cells[2]).toBe('n/a');          // deleted record ignored
  });
});
