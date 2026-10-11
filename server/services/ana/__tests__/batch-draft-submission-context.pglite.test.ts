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
const SECTION = '3.2.S.2.3';
const sections = [{ section_type: SECTION, instructions: 'Draft only supplied sponsor facts.' }];
const run = (input: Record<string, unknown> = {}, ctx: ToolContext = CTX) =>
  getToolHandler('batch_draft_sections')!({ sections, ...input }, ctx).then(JSON.parse);
const request = (index = 0) => h.route.mock.calls[index][0];
const prompt = (index = 0) => request(index).messages[1].content as string;
const response = { content: '<p>Generated draft.</p>', model: 'test-model', usage: { inputTokens: 10, outputTokens: 20, estimatedCostUsd: 0 }, latencyMs: 5, finishReason: 'end_turn' };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE regulatory_programs (
    id uuid PRIMARY KEY, organization_id integer NOT NULL, program_type text,
    primary_agency text, metadata jsonb, deleted_at timestamp
  ); CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, regulatory_program_id uuid)`);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec('TRUNCATE regulatory_programs, projects');
  h.query.mockReset().mockImplementation((sql: string, args: unknown[] = []) => pg.query(sql, args));
  h.getPool.mockReset().mockReturnValue({ query: h.query });
  h.route.mockReset().mockResolvedValue(response);
  await seed();
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
    expect(h.query.mock.calls.map(call => call[1])).toEqual([[PROGRAM, 7], [PROGRAM, 7]]);
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
    await pg.query('INSERT INTO projects VALUES ($1,$2,$3)', [11, 7, PROGRAM]);
    await run({}, { organizationId: 7, userId: 3, projectId: 11 });
    expect(request().metadata.submissionType).toBe('US_IND');
    expect(h.query.mock.calls.map(call => call[1])).toEqual([[11, 7], [PROGRAM, 7], [PROGRAM, 7]]);
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

  it.each([' EU_MAA ', 'NOT_A_REAL_TYPE'])('preserves explicit nonblank type %j without any project read', async submission_type => {
    await run({ submission_type });
    expect(request().metadata.submissionType).toBe(submission_type);
    expect(h.query).not.toHaveBeenCalled();
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

  it.each(['EMA', 'MHRA', 'US FDA', null])('does not map an IND with unsupported or absent agency %j', async agency => {
    await seed({ metadata: {}, agency });
    await run();
    expectUnassessed();
  });

  it.each([
    { organizationId: 8 }, { deletedAt: '2026-10-01' },
  ])('does not read filing facts from another tenant or a deleted program %j', async override => {
    await seed(override);
    await run();
    expectUnassessed();
    expect(h.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { organizationId: 7, userId: 3 },
    { organizationId: 7, userId: 3, projectRef: 'invalid-id' },
    { organizationId: 0, userId: 3, projectRef: PROGRAM },
  ])('keeps absent or invalid open context unassessed without a program-fact read %j', async ctx => {
    await run({}, ctx);
    expectUnassessed();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('does not trust a legacy anchor that names another tenant program', async () => {
    await seed({ organizationId: 8 });
    await pg.query('INSERT INTO projects VALUES ($1,$2,$3)', [11, 7, PROGRAM]);
    await run({}, { organizationId: 7, userId: 3, projectId: 11 });
    expectUnassessed();
    expect(h.query).toHaveBeenCalledTimes(2);
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

describe('inference retains bounded batch and per-section behavior', () => {
  it('accepts 20 sections, reads filing facts once and keeps the 21-section guard before reads', async () => {
    const twenty = Array.from({ length: 20 }, () => sections[0]);
    expect(await run({ sections: twenty })).toMatchObject({ count: 20, failed: 0, savedCount: 0 });
    expect(h.query).toHaveBeenCalledTimes(2);
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
