/** Real deployed section SQL proves tenant-owned metadata capture, without draft generation or persistence. */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), getPool: vi.fn(), hasRole: vi.fn(), errors: [] as string[] }));
vi.mock('../../../db', () => ({ db: {}, pool: { query: h.query }, getPool: h.getPool, getDb: () => ({}) }));
vi.mock('../../../db.js', () => ({ db: {}, pool: { query: h.query }, getPool: h.getPool, getDb: () => ({}) }));
// Keep the real dispatcher gates; only the already-verified member role is a fixture.
vi.mock('../../roleBasedAccess', () => ({ default: { hasRole: h.hasRole } }));

import { COMMAND_HANDLER_NAMES, COMMAND_REGISTRY, draftSection, executeCommands, type CommandContext } from '../command-executor';

let pg: PGlite;
const OWN = '10000000-0000-4000-8000-000000000001';
const FOREIGN = '10000000-0000-4000-8000-000000000002';
const MISSING = '10000000-0000-4000-8000-000000000003';
const DOC = '20000000-0000-4000-8000-000000000001';
const CTX: CommandContext = { userId: 3, organizationId: 7, activeProjectId: 42 };
const run = (sectionId: unknown = OWN, ctx: CommandContext = CTX) => draftSection(ctx, { sectionId });
const prepared = {
  success: true, action: 'draft_section',
  data: { sectionId: OWN, code: '2.5', title: 'Owned Clinical Overview', status: 'prepared', draftGenerated: false },
  message: 'Section 2.5 metadata prepared for drafting. No draft content was generated or saved.',
};
const notFound = (sectionId: string) => ({ success: false, action: 'draft_section', message: `Section ${sectionId} not found.` });

beforeAll(async () => {
  const path = 'db/migrations/20260801_consolidated_tree_reconciliation.sql';
  const migration = readFileSync(path, 'utf8');
  const ddl = migration.match(/CREATE TABLE IF NOT EXISTS doc_sections \([\s\S]*?\n\);/)?.[0];
  if (!ddl) throw new Error('Deployed doc_sections creator not found');
  expect(readFileSync('scripts/db/migration-set.mjs', 'utf8')).toContain(`'${path}'`);
  expect(ddl).toMatch(/tenant_id\s+INTEGER NOT NULL/);
  expect(ddl).toMatch(/doc_id\s+UUID,/);
  expect(ddl).not.toMatch(/project_id|REFERENCES/);
  pg = new PGlite();
  await pg.exec(ddl);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec('TRUNCATE doc_sections');
  await pg.query(`INSERT INTO doc_sections (id, doc_id, tenant_id, code, title, content)
    VALUES ($1, $2, 7, '2.5', 'Owned Clinical Overview', '{"text":"Original owned content"}'),
           ($3, $2, 8, '2.7', 'Foreign secret title', '{"text":"Foreign secret content"}')`, [OWN, DOC, FOREIGN]);
  h.errors = [];
  h.query.mockReset().mockImplementation(async (sql: string, args: unknown[] = []) => {
    try { return await pg.query(sql, args); }
    catch (error) { h.errors.push((error as { code: string }).code); throw error; }
  });
  h.getPool.mockReset().mockReturnValue({ query: h.query });
  h.hasRole.mockReset().mockResolvedValue(true);
});

describe('tenant-owned section metadata preparation', () => {
  it('preserves owned section identifiers and title while explicitly reporting capture only', async () => {
    const before = await pg.query('SELECT * FROM doc_sections ORDER BY id');
    expect(await run()).toEqual(prepared);
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.query.mock.calls[0][1]).toEqual([OWN, 7]);
    expect(h.query.mock.calls[0][0]).toMatch(/^SELECT id, code, title FROM doc_sections/);
    expect(h.errors).toEqual([]);
    expect((await pg.query('SELECT * FROM doc_sections ORDER BY id')).rows).toEqual(before.rows);
  });

  it('refuses a real foreign-tenant row without exposing its metadata or content', async () => {
    const out = await run(FOREIGN);
    expect(out).toEqual(notFound(FOREIGN));
    expect(JSON.stringify(out)).not.toContain('Foreign secret');
    expect(out.data).toBeUndefined();
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.query.mock.calls[0][1]).toEqual([FOREIGN, 7]);
    expect(h.errors).toEqual([]);
  });

  it('treats absent and foreign rows identically except the supplied section identifier', async () => {
    expect(await run(MISSING)).toEqual(notFound(MISSING));
    expect(await run(FOREIGN)).toEqual(notFound(FOREIGN));
    expect(h.errors).toEqual([]);
  });

  it('uses the verified tenant, ignoring tenant overrides in command parameters', async () => {
    expect(await draftSection(CTX, { sectionId: FOREIGN, organizationId: 8, tenant_id: 8 })).toEqual(notFound(FOREIGN));
    expect(h.query.mock.calls[0][1]).toEqual([FOREIGN, 7]);
  });

  it('prepares a tenant-owned row with no document link without claiming active-project binding', async () => {
    await pg.query('UPDATE doc_sections SET doc_id = NULL WHERE id = $1', [OWN]);
    expect(await run(OWN, { ...CTX, activeProjectId: 99 })).toEqual(prepared);
    expect(h.query.mock.calls[0][1]).toEqual([OWN, 7]);
  });
});

describe('identity and missing-input guards run before database access', () => {
  it.each([undefined, null, '7', 0, -1, 7.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuses invalid tenant %j without acquiring a pool', async organizationId => {
      h.getPool.mockImplementation(() => { throw new Error('Database must not be acquired'); });
      expect(await run(OWN, { ...CTX, organizationId: organizationId as unknown as number })).toEqual({
        success: false, action: 'draft_section', message: 'organizationId must be a positive safe integer.',
      });
      expect(h.getPool).not.toHaveBeenCalled();
      expect(h.query).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', null])('preserves sectionId required for %j before querying', async sectionId => {
    expect(await draftSection(CTX, { sectionId })).toEqual({ success: false, action: 'draft_section', message: 'sectionId required.' });
    expect(h.getPool).not.toHaveBeenCalled();
    expect(h.query).not.toHaveBeenCalled();
  });
});

describe('registered public dispatch preserves governance and capture truth', () => {
  it('advertises capture only through the existing discoverable command', () => {
    expect(COMMAND_HANDLER_NAMES).toContain('draft_section');
    expect(COMMAND_REGISTRY.find(c => c.name === 'draft_section')).toMatchObject({
      parameters: 'sectionId',
      description: 'Prepare tenant-owned section metadata for drafting; does not generate or save draft content.',
    });
  });

  it('returns the same prepared receipt through the real confirmed dispatcher', async () => {
    const [out] = await executeCommands([{ command: 'draft_section', params: { sectionId: OWN } }], {
      ...CTX, anaToolPolicy: {}, part11Enforce: false, humanConfirmed: true,
    });
    expect(out).toEqual(prepared);
    expect(h.hasRole).toHaveBeenCalledWith(3, 'member', 7);
    expect(h.query.mock.calls.map(call => call[1])).toEqual([[OWN, 7]]);
  });

  it('still proposes an unconfirmed command without reading the section', async () => {
    const [out] = await executeCommands([{ command: 'draft_section', params: { sectionId: OWN } }], {
      ...CTX, anaToolPolicy: {}, part11Enforce: false,
    });
    expect(out).toMatchObject({ success: false, action: 'draft_section', error: 'HUMAN_CONFIRMATION_REQUIRED' });
    expect(h.query).not.toHaveBeenCalled();
  });
});

describe('real database failures remain failed preparation', () => {
  it('reports a real missing-table error instead of successful capture', async () => {
    await pg.exec('ALTER TABLE doc_sections RENAME TO unavailable_sections');
    try {
      expect(await run()).toEqual({ success: false, action: 'draft_section', message: 'Section preparation failed.', error: 'relation "doc_sections" does not exist' });
      expect(h.errors).toEqual(['42P01']);
    } finally { await pg.exec('ALTER TABLE unavailable_sections RENAME TO doc_sections'); }
  });

  it('reports an invalid section UUID through the existing failure boundary', async () => {
    expect(await run('not-a-uuid')).toEqual({ success: false, action: 'draft_section', message: 'Section preparation failed.', error: 'invalid input syntax for type uuid: "not-a-uuid"' });
    expect(h.errors).toEqual(['22P02']);
  });
});
