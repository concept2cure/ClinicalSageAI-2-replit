/**
 * The portfolio card carries what the project says it is (S11; BUILD_ORDER §1,
 * the D2 row "S11 or F1 (not D2)"; .design/claude-convergence/D2.md §1.4 item 10).
 *
 * D2's calm card shows one line: the project's description, or else its filing
 * in words (filing type · agency · indication). The portfolio read projected
 * none of those four facts, though each is a column of `regulatory_programs`
 * (migrations/20260524_program_workbench_schema.sql, entry 1 of the migration
 * set). So the card could only fall back to stage and lead, or read every
 * project's detail a second time.
 *
 * On PGlite, with the real DDL, through both callers of the one projection
 * (the list and the creator's 201 re-read):
 *   - a stated description, indication, agency and filing type are read as stored;
 *   - an absent or blank one is null, never a default (fail closed);
 *   - the change is additive: every key the card carried before is still there,
 *     with the same values.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PROJECT_CARD_CREATED_SQL, PROJECT_CARD_LIST_SQL, portfolioAnchorJson } from '../project-portfolio';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ORG = 7;
const LEAD = 11;
const WORKSPACE = 3;
/** Every fact stated. */
const IND = '11111111-1111-4111-8111-111111111111';
/** No description, a blank indication: the card must read them as absent. */
const K510 = '22222222-2222-4222-8222-222222222222';
/** Whitespace-only description, no indication. */
const MAA = '33333333-3333-4333-8333-333333333333';

const DESCRIPTION = 'Oral JAK1 inhibitor, first-in-human through phase 2 under one IND.';
const INDICATION = 'Moderate-to-severe plaque psoriasis in adults';

/** The keys the card carried before this change (2026-10-31 projection). */
const PRIOR_KEYS = ['id', 'title', 'ws', 'pathway', 'code', 'stage', 'status', 'lead', 'due', 'due_date',
  'activity', 'client_workspace_id', 'client_name'] as const;

const anchors = [
  { programId: IND, projectId: 101, clientWorkspaceId: WORKSPACE },
  { programId: K510, projectId: 102, clientWorkspaceId: WORKSPACE },
  { programId: MAA, projectId: 103, clientWorkspaceId: WORKSPACE },
];

let jdb: JourneyDb;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: extractTableDdl('migrations/0000_sweet_joseph.sql', [
      'organizations', 'users', 'organization_users', 'audit_logs', 'client_workspaces', 'projects',
    ]),
    migrations: [
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260929_actor_names.sql',
      'migrations/20260524_program_workbench_schema.sql',
      'migrations/20260814_projects_regulatory_program_anchor.sql',
    ],
  });
  const q = jdb.pool.query;
  await q(`INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES (${ORG}, 'Org', 'org', 'standard', 10)`);
  await q(`INSERT INTO users (id, email, name, password_hash) VALUES (${LEAD}, 'ra@example.test', 'Robin RA', 'x')`);
  await q(`INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${LEAD}, 'manager')`);
  await q(`INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES (${WORKSPACE}, ${ORG}, 'Northwind Bio', 'northwind')`);
  const program = `INSERT INTO regulatory_programs (id, organization_id, name, code, description, program_type, product_type,
      product_name, primary_agency, indication, status, phase, lead_user_id, target_submission_date)
    VALUES ($1, ${ORG}, $2, $3, $4, $5, $6, $2, $7, $8, 'active', 'authoring', ${LEAD}, $9)`;
  await q(program, [IND, 'Vorelinib IND', 'NW-001', DESCRIPTION, 'ind', 'drug', 'FDA', INDICATION, '2027-03-15']);
  await q(program, [K510, 'Glucose sensor 510(k)', 'NW-002', null, '510k', 'device', 'FDA', '   ', null]);
  await q(program, [MAA, 'Vorelinib MAA', 'NW-003', ' \n\t ', 'maa', 'drug', 'EMA', null, null]);
  for (const a of anchors) {
    await q(`INSERT INTO projects (id, organization_id, client_workspace_id, name, type, regulatory_program_id)
      VALUES ($1, ${ORG}, ${WORKSPACE}, $2, 'regulatory', $3)`, [a.projectId, `anchor ${a.projectId}`, a.programId]);
  }
});
afterAll(async () => { await jdb?.close?.(); });

async function listCards(): Promise<Array<Record<string, unknown>>> {
  const { rows } = await jdb.pool.query(PROJECT_CARD_LIST_SQL,
    [ORG, 50, 0, false, anchors.map(a => a.programId), portfolioAnchorJson(anchors), null, null, null]);
  return rows as Array<Record<string, unknown>>;
}

async function createdCard(programId: string): Promise<Record<string, unknown>> {
  const anchor = anchors.find(a => a.programId === programId)!;
  const { rows } = await jdb.pool.query(PROJECT_CARD_CREATED_SQL, [programId, ORG, portfolioAnchorJson([anchor])]);
  expect(rows).toHaveLength(1);
  return rows[0] as Record<string, unknown>;
}

describe('the portfolio card carries the project’s description and filing', () => {
  it('reads a stated description, indication, agency and filing type as stored, in the list', async () => {
    const card = (await listCards()).find(row => row.id === IND);
    expect(card).toMatchObject({
      description: DESCRIPTION,
      indication: INDICATION,
      agency: 'FDA',
      program_type: 'ind',
    });
  });

  it('reads the same four facts in the creator’s 201 projection', async () => {
    expect(await createdCard(IND)).toMatchObject({
      description: DESCRIPTION,
      indication: INDICATION,
      agency: 'FDA',
      program_type: 'ind',
    });
  });

  it('answers null for an absent or blank description or indication, never a default', async () => {
    const cards = await listCards();
    const device = cards.find(row => row.id === K510)!;
    const maa = cards.find(row => row.id === MAA)!;
    expect(device).toHaveProperty('description', null);
    expect(device).toHaveProperty('indication', null);
    expect(device).toMatchObject({ agency: 'FDA', program_type: '510k' });
    expect(maa).toHaveProperty('description', null);
    expect(maa).toHaveProperty('indication', null);
    expect(maa).toMatchObject({ agency: 'EMA', program_type: 'maa' });
    const created = await createdCard(K510);
    expect(created).toHaveProperty('description', null);
    expect(created).toHaveProperty('indication', null);
  });

  /* F1, 2026-11-12. `id` is the program's uuid. Sentinel's findings, the blockers and the work due carry the
     numeric id of the project row instead, so the Projects screen could not say which project an at-risk row
     belongs to. The card carries that number too, from the join the card already makes. */
  it('carries the anchor project’s numeric id, in the list and in the creator’s 201', async () => {
    const cards = await listCards();
    for (const anchor of anchors) {
      const card = cards.find(row => row.id === anchor.programId)!;
      expect(card.project_id, `the list card of ${anchor.programId}`).toBe(anchor.projectId);
      expect(typeof card.project_id).toBe('number');
      expect(card.id, 'the card’s id stays the program’s').toBe(anchor.programId);
    }
    expect((await createdCard(K510)).project_id).toBe(102);
    // One projection for both statements: the 201 card and the list card keep the same keys.
    expect(Object.keys(await createdCard(IND)).sort()).toEqual(Object.keys(cards.find(row => row.id === IND)!).sort());
  });

  it('is additive: every key the card carried before is still there, with its value', async () => {
    const card = (await listCards()).find(row => row.id === IND)!;
    for (const key of PRIOR_KEYS) expect(card).toHaveProperty(key);
    expect(card).toMatchObject({
      title: 'Vorelinib IND', ws: 'Biotech', pathway: 'ind', code: 'NW-001', stage: 'Authoring', status: 'active',
      lead: 'Robin RA', due_date: '2027-03-15', client_workspace_id: WORKSPACE, client_name: 'Northwind Bio',
    });
  });
});
