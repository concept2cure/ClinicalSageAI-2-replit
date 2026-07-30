/**
 * assembleOrgCroPortfolio — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: sponsor engagements persisted in the REAL CRO store
 * (cro_clients + cro_studies + cro_regulatory_submissions + cro_milestones +
 * cro_team_assignments — the tables the /api/cro CRUD routes write) are assembled
 * into the CroPortfolio surface's CroSponsor shape, with the SOW status derived
 * live from the real contract facts, the dispatch gate rolled up live from each
 * submission's milestones, the engagement lead resolved through the real
 * users join, strict INTEGER org scope on every table, and fields the store has
 * no fact for honestly null. (The cro_* tables carry no deleted_at — hard-delete
 * store — so there is no soft-delete dimension to prove.)
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

import { assembleOrgCroPortfolio } from '../cro-portfolio-view-assembler';

const ORG = 7;
const OTHER = 9;
const NOW = new Date('2026-07-30T12:00:00Z');

// Real columns the assembler reads (migrations/0000_sweet_joseph.sql), INTEGER
// organization_id throughout — unlike the TEXT-scoped PV store, the CRO store is
// INT-scoped, and the queries must bind numbers.
const DDL = `
CREATE TABLE users (id serial PRIMARY KEY, name text NOT NULL, email text);
CREATE TABLE cro_clients (
  id serial PRIMARY KEY, organization_id integer NOT NULL, name text NOT NULL,
  company_type text NOT NULL, contract_start_date timestamp, contract_end_date timestamp,
  contract_status text DEFAULT 'active' NOT NULL, risk_level text DEFAULT 'medium' NOT NULL,
  notes text, created_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE cro_studies (
  id serial PRIMARY KEY, organization_id integer NOT NULL, client_id integer NOT NULL,
  study_number text NOT NULL, study_title text NOT NULL, study_type text NOT NULL,
  therapeutic_area text NOT NULL, indication text NOT NULL, study_phase text,
  target_enrollment integer, current_enrollment integer DEFAULT 0,
  study_status text DEFAULT 'planning' NOT NULL
);
CREATE TABLE cro_regulatory_submissions (
  id serial PRIMARY KEY, organization_id integer NOT NULL, client_id integer NOT NULL,
  study_id integer, submission_type text NOT NULL, submission_number text,
  regulatory_region text NOT NULL, submission_status text DEFAULT 'draft' NOT NULL,
  submission_date timestamp, expected_approval_date timestamp
);
CREATE TABLE cro_milestones (
  id serial PRIMARY KEY, organization_id integer NOT NULL, client_id integer NOT NULL,
  study_id integer, submission_id integer, title text NOT NULL, category text NOT NULL,
  priority text DEFAULT 'medium' NOT NULL, status text DEFAULT 'planned' NOT NULL
);
CREATE TABLE cro_team_assignments (
  id serial PRIMARY KEY, organization_id integer NOT NULL, user_id integer NOT NULL,
  client_id integer, study_id integer, submission_id integer, role text NOT NULL,
  assignment_type text DEFAULT 'primary' NOT NULL, start_date timestamp NOT NULL,
  end_date timestamp, status text DEFAULT 'active' NOT NULL
);
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(
    `DELETE FROM cro_team_assignments; DELETE FROM cro_milestones;
     DELETE FROM cro_regulatory_submissions; DELETE FROM cro_studies;
     DELETE FROM cro_clients; DELETE FROM users;`,
  );
});

async function insertUser(name: string): Promise<number> {
  const r = await pglite.query(`INSERT INTO users (name) VALUES ($1) RETURNING id`, [name]);
  return Number((r.rows[0] as { id: number }).id);
}

async function insertClient(org: number, o: Record<string, unknown>): Promise<number> {
  const r = await pglite.query(
    `INSERT INTO cro_clients (organization_id, name, company_type, contract_status, risk_level, contract_end_date, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [org, o.name, o.companyType ?? 'biotech', o.contractStatus ?? 'active',
     o.riskLevel ?? 'medium', o.contractEndDate ?? null, o.notes ?? null],
  );
  return Number((r.rows[0] as { id: number }).id);
}

async function insertStudy(org: number, clientId: number, o: Record<string, unknown>): Promise<void> {
  await pglite.query(
    `INSERT INTO cro_studies (organization_id, client_id, study_number, study_title, study_type,
        therapeutic_area, indication, study_phase, study_status, current_enrollment, target_enrollment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [org, clientId, o.number, o.title ?? String(o.number), o.type ?? 'interventional',
     o.area ?? 'Oncology', o.indication ?? 'indication', o.phase ?? null,
     o.status ?? 'planning', o.current ?? 0, o.target ?? null],
  );
}

async function insertSub(org: number, clientId: number, o: Record<string, unknown>): Promise<number> {
  const r = await pglite.query(
    `INSERT INTO cro_regulatory_submissions (organization_id, client_id, submission_number,
        submission_type, regulatory_region, submission_status, expected_approval_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [org, clientId, o.number ?? null, o.type ?? 'IND', o.region ?? 'FDA',
     o.status ?? 'draft', o.expected ?? null],
  );
  return Number((r.rows[0] as { id: number }).id);
}

async function insertMilestone(org: number, clientId: number, subId: number | null, status: string): Promise<void> {
  await pglite.query(
    `INSERT INTO cro_milestones (organization_id, client_id, submission_id, title, category, status)
     VALUES ($1,$2,$3,'Gate','regulatory',$4)`,
    [org, clientId, subId, status],
  );
}

async function insertAssignment(org: number, userId: number, clientId: number, o: Record<string, unknown> = {}): Promise<void> {
  await pglite.query(
    `INSERT INTO cro_team_assignments (organization_id, user_id, client_id, study_id, submission_id,
        role, assignment_type, start_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [org, userId, clientId, o.studyId ?? null, o.submissionId ?? null,
     o.role ?? 'Engagement lead', o.assignmentType ?? 'primary',
     o.startDate ?? '2026-01-01', o.status ?? 'active'],
  );
}

describe('assembleOrgCroPortfolio', () => {
  it('maps a real engagement into the CroSponsor shape with live SOW / gate / lead rollups', async () => {
    const webb = await insertUser('M. Webb');
    const helix = await insertClient(ORG, {
      name: 'Helix Therapeutics', companyType: 'biotech', riskLevel: 'low',
      contractEndDate: '2027-04-01', notes: 'MSA + 2 active SOWs - renews Q1 2027',
    });
    await insertAssignment(ORG, webb, helix);
    await insertStudy(ORG, helix, {
      number: 'BX204-301', phase: 'Phase 3', indication: 'rezatinib - RTK-X+ solid tumors',
      status: 'recruiting', current: 412, target: 480,
    });
    await insertStudy(ORG, helix, {
      number: 'AUR-RWE', phase: 'RWE', indication: 'Post-market registry',
      status: 'ongoing', current: 1240, target: null,
    });
    const bla = await insertSub(ORG, helix, {
      number: 'BLA 761204', type: 'BLA', region: 'FDA - CBER',
      status: 'assembling', expected: '2026-11-15',
    });
    await insertMilestone(ORG, helix, bla, 'in_progress');
    await insertMilestone(ORG, helix, bla, 'planned');

    const rows = await assembleOrgCroPortfolio(ORG, NOW) as any[];
    expect(rows).toHaveLength(1);
    const s = rows[0];
    expect(s.id).toBe(String(helix));
    expect(s.name).toBe('Helix Therapeutics');
    expect(s.type).toBe('biotech');                              // company_type
    expect(s.lead).toBe('M. Webb');                              // users.name via active assignment
    expect(s.sow).toBe('on-track');                              // active + low risk + end > 60d out
    expect(s.sowNote).toBe('MSA + 2 active SOWs - renews Q1 2027'); // notes
    expect(s.studies).toHaveLength(2);
    expect(s.studies[0]).toEqual({
      code: 'BX204-301', phase: 'Phase 3', ind: 'rezatinib - RTK-X+ solid tumors',
      status: 'Enrolling',                                       // recruiting → display label
      n: '412 / 480',                                            // current / target
    });
    expect(s.studies[1].status).toBe('Ongoing');
    expect(s.studies[1].n).toBe('1,240 / —');                    // no target → honest dash
    expect(s.subs).toHaveLength(1);
    expect(s.subs[0]).toEqual({
      id: 'BLA 761204', type: 'BLA', region: 'FDA - CBER', state: 'assembling',
      gate: '2 gates open',                                      // live milestone rollup
      due: 'Nov 2026',                                           // expected_approval_date
    });
  });

  it('derives every SOW state from the real contract facts, roster in insertion order', async () => {
    const a = await insertClient(ORG, { name: 'OnTrack', riskLevel: 'low', contractEndDate: '2026-12-01' });
    const b = await insertClient(ORG, { name: 'AtRisk', riskLevel: 'high' });
    const c = await insertClient(ORG, { name: 'RenewalDue', riskLevel: 'low', contractEndDate: '2026-08-20' });
    const d = await insertClient(ORG, { name: 'Expired', contractStatus: 'expired', riskLevel: 'low' });

    const rows = await assembleOrgCroPortfolio(ORG, NOW) as any[];
    expect(rows.map((r) => r.id)).toEqual([String(a), String(b), String(c), String(d)]);
    expect(rows.map((r) => r.sow)).toEqual(['on-track', 'at-risk', 'renewal-due', 'expired']);
  });

  it('rolls up gate clear / no gates, normalizes post-filing states, and honest-nulls gaps', async () => {
    const client = await insertClient(ORG, { name: 'Cohort Bio', notes: null });
    // Study the store tracks no enrollment for, already completed.
    await insertStudy(ORG, client, { number: 'LIN-AV', phase: null, status: 'completed', current: 0, target: null });
    // Frozen sub whose only milestone is closed → 'gate clear'; no expected date → due null.
    const ind = await insertSub(ORG, client, { number: 'IND 178432', type: 'IND', status: 'frozen', expected: null });
    await insertMilestone(ORG, client, ind, 'completed');
    // Post-filing store vocabulary lands on the dispatched lifecycle state; no
    // milestones → gate null; no submission_number → stable PK-derived code.
    const nda = await insertSub(ORG, client, { number: null, type: 'NDA', status: 'submitted', expected: null });

    const s = (await assembleOrgCroPortfolio(ORG, NOW))[0] as any;
    expect(s.lead).toBeNull();                                   // nobody assigned — honest null
    expect(s.sowNote).toBeNull();
    expect(s.studies[0].phase).toBeNull();
    expect(s.studies[0].status).toBe('Complete');                // completed → display label
    expect(s.studies[0].n).toBe('—');                            // enrollment not tracked
    const byType = Object.fromEntries(s.subs.map((x: any) => [x.type, x]));
    expect(byType.IND.gate).toBe('gate clear');
    expect(byType.IND.due).toBeNull();
    expect(byType.NDA.id).toBe(`SUB-${nda}`);
    expect(byType.NDA.state).toBe('dispatched');                 // submitted → past the dispatch gate
    expect(byType.NDA.gate).toBeNull();                          // no gates tracked
  });

  it('resolves the engagement lead from the client-level primary active assignment', async () => {
    const uPrimary = await insertUser('A. Muller');
    const uSecondary = await insertUser('B. Secondary');
    const uInactive = await insertUser('C. Gone');
    const uStudyLevel = await insertUser('D. Study');
    const client = await insertClient(ORG, { name: 'Meridian Pharma' });
    // Inactive assignment never wins, even though it is oldest.
    await insertAssignment(ORG, uInactive, client, { status: 'completed', startDate: '2025-01-01' });
    // Study-level assignment loses to a client-level one.
    await insertAssignment(ORG, uStudyLevel, client, { studyId: 999, startDate: '2025-02-01' });
    // Secondary starts earlier, but 'primary' wins.
    await insertAssignment(ORG, uSecondary, client, { assignmentType: 'support', startDate: '2025-03-01' });
    await insertAssignment(ORG, uPrimary, client, { assignmentType: 'primary', startDate: '2026-01-01' });

    const s = (await assembleOrgCroPortfolio(ORG, NOW))[0] as any;
    expect(s.lead).toBe('A. Muller');
  });

  it('returns [] for an org with no clients and never crosses tenants (INTEGER org scope on every table)', async () => {
    const u = await insertUser('X. Tenant');
    const mine = await insertClient(ORG, { name: 'Mine' });
    await insertClient(OTHER, { name: 'Theirs' });
    // Child rows pointing at MY client but stamped with the other org must not leak
    // into my portfolio: every child query filters organization_id too.
    await insertStudy(OTHER, mine, { number: 'X-1', status: 'recruiting' });
    const foreignSub = await insertSub(OTHER, mine, { number: 'X-SUB', type: 'IND' });
    await insertMilestone(OTHER, mine, foreignSub, 'planned');
    await insertAssignment(OTHER, u, mine);
    // And a foreign-org milestone against MY submission must not pollute my gate.
    const mySub = await insertSub(ORG, mine, { number: 'IND 1', type: 'IND' });
    await insertMilestone(OTHER, mine, mySub, 'planned');

    const rows = await assembleOrgCroPortfolio(ORG, NOW) as any[];
    expect(rows).toHaveLength(1);
    const s = rows[0] as any;
    expect(s.name).toBe('Mine');
    expect(s.studies).toEqual([]);
    expect(s.lead).toBeNull();
    expect(s.subs).toHaveLength(1);
    expect(s.subs[0].id).toBe('IND 1');
    expect(s.subs[0].gate).toBeNull();                           // foreign milestone excluded

    expect(await assembleOrgCroPortfolio(42, NOW)).toEqual([]);  // empty org — honest []
  });
});
