/** The registered batch tool supplies the existing drafting engine with the open filing identity. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({ query: vi.fn(), getPool: vi.fn(), route: vi.fn() }));
vi.mock('../../../db', () => ({ db: {}, pool: { query: h.query }, getPool: h.getPool }));
vi.mock('../../../db.js', () => ({ db: {}, pool: { query: h.query }, getPool: h.getPool }));
vi.mock('../../ai-gateway/gateway', async importOriginal => ({
  ...await importOriginal<typeof import('../../ai-gateway/gateway')>(),
  getGateway: () => ({ route: h.route }),
}));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor';

let pg: PGlite;
const PROGRAM = '20000000-0000-4000-8000-000000000001';
const CTX: ToolContext = { organizationId: 7, userId: 3, projectRef: PROGRAM };
const SQL = { query: h.query };
const SECTION = '3.2.S.2.3';
const sections = [{ section_type: SECTION, instructions: 'Draft only supplied sponsor facts.' }];
const run = (input: Record<string, unknown> = {}, ctx: ToolContext = CTX) =>
  getToolHandler('batch_draft_sections')!({ sections, ...input }, { sqlClient: SQL, ...ctx }).then(JSON.parse);
const request = (index = 0) => h.route.mock.calls[index][0];
const prompt = (index = 0) => request(index).messages[1].content as string;
const response = { content: '<p>Generated draft.</p>', model: 'test-model', usage: { inputTokens: 10, outputTokens: 20, estimatedCostUsd: 0 }, latencyMs: 5, finishReason: 'end_turn' };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE regulatory_programs (
    id uuid PRIMARY KEY, organization_id integer NOT NULL, program_type text,
    primary_agency text, metadata jsonb, deleted_at timestamp, product_type text, indication text
  );
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id integer, user_id integer, role text);
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (reviewer_id integer, organization_id integer, artifact_id uuid, status text);
    CREATE TABLE concept2cure_artifacts (id uuid PRIMARY KEY, project_id integer, organization_id integer);
    CREATE TABLE project_charters (id serial PRIMARY KEY, organization_id integer, project_id integer, version integer,
      updated_at timestamptz, approval_status text, therapeutic_area text, development_stage text, target_population text);`);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec(`TRUNCATE regulatory_programs, projects, organization_users, users, organizations,
    project_members, project_charters RESTART IDENTITY;
    INSERT INTO organizations VALUES(7,'active'),(8,'active');
    INSERT INTO users VALUES(3,'active'),(5,'active'),(8,'active');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(7,3,'member'),(7,5,'member'),(7,8,'member');
    INSERT INTO projects VALUES(11,7,71,'${PROGRAM}',5,5,'{"projectSharing":{"visibility":"private","members":[]}}');
    INSERT INTO project_members VALUES(11,7,3,'use','active');
    INSERT INTO project_charters(organization_id,project_id,version,approval_status,therapeutic_area,development_stage,target_population)
      VALUES(7,11,3,'draft','oncology','phase_2','Adults');`);
  h.query.mockReset().mockImplementation((sql: string, args: unknown[] = []) => pg.query(sql, args));
  h.getPool.mockReset().mockReturnValue({ query: h.query });
  h.route.mockReset().mockResolvedValue(response);
  await seed();
  await pg.query('UPDATE regulatory_programs SET product_type=$1, indication=$2 WHERE id=$3', ['drug','Recorded synthetic indication',PROGRAM]);
});

async function seed(overrides: Record<string, unknown> = {}) {
  const row = { organizationId: 7, programType: 'ind', agency: 'FDA', metadata: { submissionTypeId: 'us_ind' }, deletedAt: null, ...overrides };
  await pg.query(`INSERT INTO regulatory_programs (id,organization_id,program_type,primary_agency,metadata,deleted_at)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (id) DO UPDATE SET
    organization_id=EXCLUDED.organization_id, program_type=EXCLUDED.program_type,
    primary_agency=EXCLUDED.primary_agency, metadata=EXCLUDED.metadata, deleted_at=EXCLUDED.deleted_at`,
  [PROGRAM, row.organizationId, row.programType, row.agency, JSON.stringify(row.metadata), row.deletedAt]);
}

function expectUnassessed() {
  expect(request().metadata.submissionType).toBeUndefined();
  expect(request().metadata.requirementsSource).toBe('none');
  expect(prompt()).toContain('SUBMISSION REQUIREMENTS STATUS: UNASSESSED');
  expect(prompt()).toContain('Do not infer a regional filing');
  expect(prompt()).not.toContain('## Drafting: Module');
}

describe('omitted batch submission type reaches canonical IND drafting requirements', () => {
  it('uses the selected open-program identity in the real drafting prompt for a deep CTD section', async () => {
    const out = await run();
    expect(request().metadata).toMatchObject({ submissionType: 'US_IND', requirementsSource: 'record:ctd-section:3.2.S.2.3:exact' });
    expect(request().messages[0].content).toContain('Investigational New Drug');
    expect(prompt()).toContain('## Drafting: Module 3.2.S.2.3 — Control of Materials');
    expect(prompt()).toContain('PROJECT SOURCE STATUS: UNASSESSED');
    expect(prompt()).not.toContain('SUBMISSION REQUIREMENTS STATUS: UNASSESSED');
    expect(h.query.mock.calls.some(call => String(call[0]).includes('FROM project_charters') && call[1][0] === 11 && call[1][1] === 7)).toBe(true);
    expect(h.query.mock.calls.some(call => String(call[0]).includes('FROM organization_users') && call[1][0] === 3 && call[1][1] === 7)).toBe(true);
    expect(out).toMatchObject({ status: 'drafted', count: 1, failed: 0, savedCount: 0, engine: 'framework-grade', sections: [{ requestIndex: 0, sectionType: SECTION, content: response.content, saved: false, authoringDocId: null }] });
  });

  it.each(['', '   '])('resolves a blank submission_type %j exactly like an omitted one', async submission_type => {
    await run({ submission_type });
    expect(request().metadata.submissionType).toBe('US_IND');
    expect(prompt()).toContain('## Drafting: Module 3.2.S.2.3');
  });

  it('accepts the recorded metadata when the driver returns a JSON string', async () => {
    await seed({ metadata: JSON.stringify({ submissionTypeId: 'US_IND' }) });
    await run();
    expect(request().metadata.submissionType).toBe('US_IND');
  });

  it('resolves the legacy project anchor through the same tenant-owned program check', async () => {
    await run({}, { organizationId: 7, userId: 3, projectId: 11 });
    expect(request().metadata.submissionType).toBe('US_IND');
    expect(h.query.mock.calls.some(call => String(call[0]).includes('FROM projects') && call[1][0] === 11 && call[1][1] === 7)).toBe(true);
  });

  it('uses the existing exact FDA+IND legacy mapping only when no choice was recorded', async () => {
    await seed({ metadata: {} });
    await run();
    expect(request().metadata.submissionType).toBe('US_IND');
  });

  it('uses a valid chosen registry identity before a conflicting legacy type/agency pair', async () => {
    await seed({ metadata: { submissionTypeId: 'EU_MAA' } });
    await run();
    expect(request().metadata.submissionType).toBe('EU_MAA');
    expect(request().messages[0].content).toContain('EMA');
    expect(prompt()).toContain('## Drafting: Module 3.2.S.2.3');
  });

  it.each([' EU_MAA ', 'NOT_A_REAL_TYPE'])('preserves explicit nonblank type %j while still admitting the recorded project', async submission_type => {
    await run({ submission_type });
    expect(request().metadata.submissionType).toBe(submission_type);
    expect(h.query.mock.calls.some(call => String(call[0]).includes('FROM organization_users'))).toBe(true);
    expect(h.query.mock.calls.some(call => String(call[0]).includes('FROM project_charters'))).toBe(true);
    expect(h.getPool).not.toHaveBeenCalled();
    expect(prompt()).not.toContain('SUBMISSION REQUIREMENTS STATUS: UNASSESSED');
  });
});

describe('unresolved project facts never become an inferred US filing', () => {
  it.each(['NOT_A_REAL_TYPE', '', 17, { id: 'US_IND' }])('does not fall back from an invalid recorded choice %j', async submissionTypeId => {
    await seed({ metadata: { submissionTypeId } });
    await run();
    expectUnassessed();
  });

  it.each([{ metadata: 'not-json' }, { metadata: [] }, { metadata: 17 }])('does not infer a filing from malformed metadata %j', async ({ metadata }) => {
    await seed({ metadata });
    await run();
    expectUnassessed();
  });

  it.each(['EMA', 'TGA', 'US FDA', null])('does not map an IND with unsupported or absent agency %j', async agency => {
    await seed({ metadata: {}, agency });
    await run();
    expectUnassessed();
  });

  // P-73: an IND filed with an agency that has exactly one trial application is that application.
  it.each([['MHRA', 'UK_CTA'], ['MFDS', 'KR_IND'], ['NMPA', 'CN_CTA']])('maps an IND filed with %s to %s', async (agency, registryId) => {
    await seed({ metadata: {}, agency });
    await run();
    expect(request().metadata.submissionType).toBe(registryId);
  });

  it.each([
    { organizationId: 8 }, { deletedAt: '2026-10-01' },
  ])('does not read filing facts from another tenant or a deleted program %j', async override => {
    await seed(override);
    const out = await run();
    expect(out).toMatchObject({ count: 0, failed: 1 });
    expect(out.sections[0].error).toBe('ANA_PROJECT_NOT_FOUND');
    expect(h.route).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(call => String(call[0]).includes('FROM project_charters'))).toBe(false);
  });

  it.each([
    { organizationId: 7, userId: 3 },
    { organizationId: 7, userId: 3, projectRef: 'invalid-id' },
    { organizationId: 0, userId: 3, projectRef: PROGRAM },
  ])('keeps absent context unassessed and refuses explicit invalid scope %j', async ctx => {
    const out = await run({}, ctx);
    if ('projectRef' in ctx) {
      expect(out).toMatchObject({ count: 0, failed: 1 });
      expect(out.sections[0].error).toMatch(/^ANA_PROJECT_/);
      expect(h.route).not.toHaveBeenCalled();
    } else {
      expectUnassessed();
    }
    expect(h.query).not.toHaveBeenCalled();
  });

  it('does not trust a legacy anchor that names another tenant program', async () => {
    await seed({ organizationId: 8 });
    const out = await run({}, { organizationId: 7, userId: 3, projectId: 11 });
    expect(out).toMatchObject({ count: 0, failed: 1 });
    expect(out.sections[0].error).toBe('ANA_PROJECT_NOT_FOUND');
    expect(h.route).not.toHaveBeenCalled();
  });

  it('keeps no-project drafting available without acquiring a database pool', async () => {
    h.getPool.mockImplementation(() => { throw new Error('database not initialized'); });
    expect(await run({}, { organizationId: 7, userId: 3 })).toMatchObject({ count: 1, failed: 0 });
    expectUnassessed();
    expect(h.getPool).not.toHaveBeenCalled();
  });
});

describe('inference read failures stop model calls with the existing batch failure receipt', () => {
  it.each(['regulatory_programs', 'metadata'])('reports a real missing %s without exposing driver errors or generating', async target => {
    const table = target === 'regulatory_programs';
    await pg.exec(table ? 'ALTER TABLE regulatory_programs RENAME TO temporarily_unavailable' : 'ALTER TABLE regulatory_programs RENAME COLUMN metadata TO temporarily_unavailable');
    try {
      const out = await run();
      expect(out.error).toBe('Batch drafting failed. No documents were saved; the failed sections can be retried.');
      expect(out).toMatchObject({ count: 0, failed: 1, retryIndices: [0], savedCount: 0 });
      expect(JSON.stringify(out)).not.toMatch(/relation|column|metadata|temporarily_unavailable/);
      expect(h.route).not.toHaveBeenCalled();
    } finally {
      await pg.exec(table ? 'ALTER TABLE temporarily_unavailable RENAME TO regulatory_programs' : 'ALTER TABLE regulatory_programs RENAME COLUMN temporarily_unavailable TO metadata');
    }
  });
});

describe('recorded product context retains current project admission', () => {
  it.each([{}, { submission_type: 'US_IND' }])('refuses a private project without active membership even with explicit hints %j', async input => {
    const out = await run(input, { ...CTX, userId: 8 });
    expect(out).toMatchObject({ count: 0, failed: 1, retryIndices: [0] });
    expect(out.sections[0].error).toBe('ANA_PROJECT_ACCESS_DENIED');
    expect(h.route).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(call => String(call[0]).includes('FROM project_charters'))).toBe(false);
  });

  it.each(['missing', 'ambiguous'])('refuses a %s anchor before product facts or generation', async kind => {
    if (kind === 'missing') await pg.exec('DELETE FROM projects');
    else await pg.query('INSERT INTO projects VALUES(12,7,71,$1,5,5,\'{}\')', [PROGRAM]);
    const out = await run();
    expect(out).toMatchObject({ count: 0, failed: 1 });
    expect(out.sections[0].error).toBe('ANA_PROJECT_ANCHOR_UNRESOLVED');
    expect(h.route).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(call => String(call[0]).includes('FROM project_charters'))).toBe(false);
  });
});

describe('inference retains bounded batch and per-section behavior', () => {
  it('accepts 20 admitted sections and keeps the 21-section guard before reads', async () => {
    const twenty = Array.from({ length: 20 }, () => sections[0]);
    expect(await run({ sections: twenty })).toMatchObject({ count: 20, failed: 0, savedCount: 0 });
    expect(h.query.mock.calls.some(call => String(call[0]).includes('FROM project_charters'))).toBe(true);
    expect(h.route).toHaveBeenCalledTimes(20);
    h.query.mockClear(); h.route.mockClear();
    expect((await run({ sections: [...twenty, sections[0]] })).error).toContain('20 sections');
    expect(h.query).not.toHaveBeenCalled();
    expect(h.route).not.toHaveBeenCalled();
  });

  it('keeps malformed request slots and individual model failures without dropping successful sections', async () => {
    h.route.mockImplementation(async req => {
      if (req.metadata.sectionType === '2.5') throw new Error('private-provider-detail');
      return response;
    });
    const out = await run({ sections: [{ section_type: 'invalid' }, sections[0], { section_type: '2.5', instructions: 'Draft.' }] });
    expect(out).toMatchObject({ count: 1, failed: 2, retryIndices: [0, 2], savedCount: 0 });
    expect(out.sections[1]).toMatchObject({ requestIndex: 1, content: response.content, saved: false });
    expect(out.sections[2]).toMatchObject({ requestIndex: 2, error: 'DRAFT_FAILED' });
    expect(JSON.stringify(out)).not.toContain('private-provider-detail');
    expect(h.route).toHaveBeenCalledTimes(2);
  });

  it('keeps an unsafe selected source failure in its original slot and drafts the other section', async () => {
    const out = await run({ sections: [{ ...sections[0], source_document_ids: ['invalid-id'] }, { section_type: '2.5', instructions: 'Draft.' }] });
    expect(out).toMatchObject({ count: 1, failed: 1, retryIndices: [0], savedCount: 0 });
    expect(out.sections[0]).toMatchObject({ requestIndex: 0, error: 'DRAFT_FAILED' });
    expect(out.sections[1]).toMatchObject({ requestIndex: 1, content: response.content });
    expect(h.route).toHaveBeenCalledTimes(1);
    expect(request().metadata.submissionType).toBe('US_IND');
  });
});
