/**
 * What a project holds, as the readiness run states it (rehearsal finding 5.4, GA-DEMO-06; re-checked in the
 * running app 2026-11-12, docs/evidence/F1/2026-11-12-reporting-readiness-board/).
 *
 * The run counted one store, `concept2cure_artifacts`. For C2C-101 that store is empty, so its board card and its
 * Executive Readiness Digest said "No governed artifacts discovered for this scope" and "No approved or locked
 * governed artifacts", while Project home showed its filing ("0 of 72 sections approved or locked") and six Vault
 * documents. The term was never defined, and the two lines took two of the card's three places.
 *
 * The run now also counts the filing's sections, by the dossier's one definition of counted and complete
 * (services/c2c/dossier-read.ts readDossierFigures, the figure Project home shows), reached from the integer
 * project through its root's program (program-project-anchor.ts programOfProject). Each statement says what it
 * counted. A store this environment has not provisioned is said as unread, never as nothing.
 *
 * Real SQL on PGlite. The projects record no registry context, so the readiness evaluator is not entered and the
 * two lifecycle rows are what is under test.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: undefined as unknown, pool: undefined as unknown }));
vi.mock('../../../db', () => ({ get db() { return state.db; }, get pool() { return state.pool; } }));

const { computeInitialRun } = await import('../orchestrator');

const P_FILING = '11111111-1111-4111-8111-111111111111';
const P_APPROVED = '22222222-2222-4222-8222-222222222222';
const P_BOTH = '33333333-3333-4333-8333-333333333333';
const P_OTHER_ORG = '44444444-4444-4444-8444-444444444444';

const BASE_TABLES = `
  CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, parent_project_id integer,
    regulatory_program_id uuid, metadata jsonb, status text NOT NULL DEFAULT 'active');
  CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer NOT NULL,
    status text NOT NULL DEFAULT 'draft', version integer NOT NULL DEFAULT 1, content_hash text, updated_at timestamp DEFAULT now());`;
const FILING_TABLES = `
  CREATE TABLE c2c_documents (id uuid PRIMARY KEY, project_id uuid NOT NULL, org_id integer NOT NULL, doc_type text NOT NULL,
    agency text NOT NULL DEFAULT 'FDA', title text, filing_scope text NOT NULL DEFAULT 'home');
  CREATE TABLE c2c_document_sections (id serial PRIMARY KEY, document_id uuid NOT NULL, section_key text NOT NULL, parent_key text,
    label text, status text NOT NULL DEFAULT 'todo', updated_at timestamp DEFAULT now());`;

async function database(sql: string): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(sql);
  return pg;
}
function use(pg: PGlite): void {
  state.db = drizzle(pg);
  state.pool = { query: (text: string, params?: unknown[]) => pg.query(text, params) };
}
const row = (run: Awaited<ReturnType<typeof computeInitialRun>>, provider: string) => run.providers.find((p) => p.provider === provider);

let pg: PGlite;
beforeAll(async () => {
  pg = await database(`${BASE_TABLES}${FILING_TABLES}
    INSERT INTO projects (id, organization_id, parent_project_id, regulatory_program_id, metadata) VALUES
      (1, 7, NULL, '${P_FILING}', '{}'),    -- a filing, nothing approved
      (2, 7, NULL, '${P_APPROVED}', '{}'),  -- a filing with one section approved and one locked
      (3, 7, NULL, NULL, '{}'),             -- no program record, nothing held
      (4, 7, NULL, NULL, '{}'),             -- governed artifacts only
      (5, 7, NULL, '${P_BOTH}', '{}'),      -- a filing and governed artifacts, nothing approved
      (6, 7, 1, NULL, '{}'),                -- a work project under project 1
      (7, 8, NULL, '${P_OTHER_ORG}', '{}'); -- another organization's
    INSERT INTO c2c_documents (id, project_id, org_id, doc_type) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000001', '${P_FILING}', 7, 'ind'),
      ('aaaaaaaa-0000-4000-8000-000000000002', '${P_APPROVED}', 7, 'ind'),
      ('aaaaaaaa-0000-4000-8000-000000000005', '${P_BOTH}', 7, 'ind'),
      ('aaaaaaaa-0000-4000-8000-000000000007', '${P_OTHER_ORG}', 8, 'ind'),
      -- The same program id under another organization's document: never counted for organization 7.
      ('aaaaaaaa-0000-4000-8000-000000000008', '${P_FILING}', 8, 'ind');
    INSERT INTO c2c_document_sections (document_id, section_key, parent_key, status) VALUES
      -- Project 1: a heading that holds two sections (not counted while 'todo'), two sections, one in review.
      ('aaaaaaaa-0000-4000-8000-000000000001', '1', NULL, 'todo'),
      ('aaaaaaaa-0000-4000-8000-000000000001', '1.1', '1', 'todo'),
      ('aaaaaaaa-0000-4000-8000-000000000001', '1.2', '1', 'drafted'),
      ('aaaaaaaa-0000-4000-8000-000000000001', '2.5', NULL, 'review'),
      ('aaaaaaaa-0000-4000-8000-000000000002', '1.1', NULL, 'approved'),
      ('aaaaaaaa-0000-4000-8000-000000000002', '1.2', NULL, 'locked'),
      ('aaaaaaaa-0000-4000-8000-000000000002', '2.5', NULL, 'todo'),
      ('aaaaaaaa-0000-4000-8000-000000000005', '1.1', NULL, 'todo'),
      ('aaaaaaaa-0000-4000-8000-000000000005', '1.2', NULL, 'todo'),
      ('aaaaaaaa-0000-4000-8000-000000000007', '1.1', NULL, 'approved'),
      ('aaaaaaaa-0000-4000-8000-000000000008', '1.1', NULL, 'approved');
    INSERT INTO concept2cure_artifacts (organization_id, project_id, status) VALUES
      (7, 4, 'draft'), (7, 4, 'draft'), (7, 5, 'draft');`);
}, 120_000);
afterAll(async () => { await pg.close(); });

describe('the readiness run states what the project holds', () => {
  it('a project with a filing and no governed artifact is not told it holds nothing', async () => {
    use(pg);
    const run = await computeInitialRun(7, 'project', '1');
    expect(row(run, 'artifact_state')).toMatchObject({ status: 'ready' });
    expect(row(run, 'artifact_state')?.blocker).toBeUndefined();
    expect(run.blockers.join(' | ')).not.toMatch(/No governed artifacts|discovered for this scope/);
  });

  it('says how many of the filing’s sections are approved or locked, by the dossier’s count', async () => {
    use(pg);
    const run = await computeInitialRun(7, 'project', '1');
    // Three counted: 1.1, 1.2 and 2.5. The heading "1" holds sections and is not counted while it is to do.
    expect(row(run, 'artifact_approval')).toMatchObject({ status: 'missing', blocker: 'No filing section is approved or locked (0 of 3).' });
    expect(run.blockers).toContain('No filing section is approved or locked (0 of 3).');
    expect(run.summary.filing).toEqual({ sections: 3, approvedOrLocked: 0 });
  });

  it('counts an approved or locked filing section as lifecycle evidence', async () => {
    use(pg);
    const run = await computeInitialRun(7, 'project', '2');
    expect(row(run, 'artifact_approval')).toMatchObject({ status: 'ready' });
    expect(row(run, 'artifact_approval')?.blocker).toBeUndefined();
    expect(run.summary.filing).toEqual({ sections: 3, approvedOrLocked: 2 });
  });

  it('says once that a project holds nothing, and what was looked for', async () => {
    use(pg);
    const run = await computeInitialRun(7, 'project', '3');
    expect(row(run, 'artifact_state')).toMatchObject({ status: 'partial', blocker: 'No filing document or governed artifact is recorded for this project.' });
    expect(row(run, 'artifact_approval')).toMatchObject({ status: 'missing' });
    // One line for it, not two: the second said the same thing in other words.
    expect(run.blockers.filter((b) => /approved or locked|recorded for this project/.test(b))).toEqual(['No filing document or governed artifact is recorded for this project.']);
  });

  it('names governed artifacts when they are what the project holds', async () => {
    use(pg);
    const artifactsOnly = await computeInitialRun(7, 'project', '4');
    expect(row(artifactsOnly, 'artifact_state')).toMatchObject({ status: 'ready' });
    expect(row(artifactsOnly, 'artifact_approval')?.blocker).toBe('No governed artifact is approved or locked (0 of 2).');
    const both = await computeInitialRun(7, 'project', '5');
    expect(row(both, 'artifact_approval')?.blocker).toBe('No filing section (0 of 2) or governed artifact (0 of 1) is approved or locked.');
  });

  it('reads a work project’s filing through its root project’s program', async () => {
    use(pg);
    const run = await computeInitialRun(7, 'project', '6');
    expect(run.summary.filing).toEqual({ sections: 3, approvedOrLocked: 0 });
  });

  it('never counts another organization’s filing, even under the same program id', async () => {
    use(pg);
    const run = await computeInitialRun(7, 'project', '7');
    expect(row(run, 'artifact_state')).toMatchObject({ status: 'partial' });
    expect(run.summary.filing).toEqual({ sections: 0, approvedOrLocked: 0 });
    // Project 1's count is its own organization's three, not four.
    expect((await computeInitialRun(7, 'project', '1')).summary.filing).toEqual({ sections: 3, approvedOrLocked: 0 });
  });

  it('sums a project group’s projects, each program once', async () => {
    use(pg);
    const run = await computeInitialRun(7, 'program', '9', { programProjectIds: [1, 2, 6] });
    expect(run.summary.filing).toEqual({ sections: 6, approvedOrLocked: 2 });
    expect(row(run, 'artifact_approval')).toMatchObject({ status: 'ready' });
  });

  it('names each source it counted on the two rows', async () => {
    use(pg);
    const run = await computeInitialRun(7, 'project', '5');
    for (const provider of ['artifact_state', 'artifact_approval']) {
      expect(row(run, provider)?.atoms).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceTable: 'concept2cure_artifacts' }),
        expect.objectContaining({ sourceTable: 'c2c_document_sections' }),
      ]));
      expect(row(run, provider)?.calculation).toMatchObject({ filingSections: 2, filingSectionsApprovedOrLocked: 0, governedArtifacts: 1 });
    }
  });
});

describe('a filing store this environment has not provisioned', () => {
  let bare: PGlite;
  beforeAll(async () => {
    bare = await database(`${BASE_TABLES}
      INSERT INTO projects (id, organization_id, regulatory_program_id, metadata) VALUES (1, 7, '${P_FILING}', '{}');`);
  }, 120_000);
  afterAll(async () => { await bare.close(); });

  it('is said as unread, never as a project that holds nothing', async () => {
    use(bare);
    const run = await computeInitialRun(7, 'project', '1');
    expect(row(run, 'artifact_state')).toMatchObject({ status: 'partial', blocker: 'The filing’s sections could not be read in this environment, and no governed artifact is recorded.' });
    expect(run.blockers.join(' | ')).not.toMatch(/No filing document/);
    expect(run.summary.filing).toEqual({ sections: null, approvedOrLocked: null });
  });
});
