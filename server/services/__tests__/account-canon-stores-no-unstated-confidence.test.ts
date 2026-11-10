/**
 * Account canon stores no confidence nobody stated, and a validation is a
 * recorded act (who, when), not a confidence of 1.0.
 *
 * Until 2026-10-15 assertCanonFact and supersedeCanonFact wrote
 * `confidenceScore ?? 0.9` — every fact asserted without a score was stored
 * at 0.9 — and validateCanonFact set `confidence_score = 1.0`. The prompt
 * renderer's "[PROVISIONAL — not yet validated]" label read `confidenceScore`
 * off snake_case rows, so it never fired. Resolution ordered by
 * `confidence_score DESC`, which in Postgres puts NULL first.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const calls = vi.hoisted(() => [] as Array<{ text: string; params: unknown[]; connection: string }>);
const database = vi.hoisted(() => ({ current: null as PGlite | null, released: 0 }));
const rowCount = vi.hoisted(() => ({ value: 1 }));
vi.mock('../../db.js', () => {
  const query = async (connection: string, text: string, params: unknown[] = []) => {
    calls.push({ text, params, connection });
    if (database.current) {
      const result = await database.current.query(text, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    }
    return { rows: [{ id: 11, canon_id: 'canon_x', version: 1 }], rowCount: rowCount.value };
  };
  return { pool: {
    query: (text: string, params?: unknown[]) => query('pool', text, params),
    connect: async () => ({
      query: (text: string, params?: unknown[]) => query('transaction', text, params),
      release: () => { database.released++; },
    }),
  } };
});

import {
  assertCanonFact,
  formatResolvedContextForPrompt,
  resolveAccountContext,
  validateCanonFact,
  lockCanonFact,
  supersedeCanonFact,
  type ResolvedAccountContext,
} from '../account-canon';

beforeEach(() => {
  calls.length = 0;
  rowCount.value = 1;
  database.current = null;
  database.released = 0;
});

describe('account canon confidence', () => {
  it('stores null, not 0.9, when the asserter stated no confidence', async () => {
    await assertCanonFact({ organizationId: 3, category: 'terminology', key: 'k', title: 'T', content: 'Use "subject", not "patient".' });
    const insert = calls.find(c => c.text.includes('INSERT INTO account_canon_items'))!;
    expect(insert.params[15], 'an unstated confidence was stored as 0.9').toBeNull();
  });

  it('validation does not write a confidence; the ledger records who validated', async () => {
    await validateCanonFact(11, 3, 41, 'Dana');
    const update = calls.find(c => c.text.includes('UPDATE account_canon_items'))!;
    expect(update.text, 'validation set confidence_score = 1.0').not.toMatch(/confidence_score/);
    const event = calls.find(c => c.text.includes('INSERT INTO account_events'))!;
    expect(event.params).toContain('account_fact_validated');
    expect(event.params).toContain(41);
  });

  it('refuses to validate an item that does not exist in the organization', async () => {
    rowCount.value = 0;
    await expect(validateCanonFact(999, 3, 41)).rejects.toMatchObject({ statusCode: 404 });
    expect(calls.some(c => c.text.includes('INSERT INTO account_events'))).toBe(false);
  });

  it('resolution sorts unmeasured confidence last and reads validation from the ledger', async () => {
    await resolveAccountContext({ organizationId: 3 }).catch(() => undefined);
    const q = calls.find(c => c.text.includes('FROM account_canon_items'))!;
    expect(q.text).toMatch(/confidence_score DESC NULLS LAST/);
    expect(q.text).toMatch(/account_fact_validated/);
  });

  it('labels an unvalidated item, and not a validated one', () => {
    const item = (title: string, validated: boolean) =>
      ({ id: 1, title, content: 'c', category: 'terminology', status: 'active', validated }) as unknown as ResolvedAccountContext['canonItems'][number];
    const text = formatResolvedContextForPrompt({
      canonItems: [item('Unchecked', false), item('Checked', true)],
      terms: [], templates: [], tokensEstimate: 0, requestId: 'r',
    });
    expect(text).toMatch(/\*\*Unchecked\*\* \[NOT YET VALIDATED\]/);
    expect(text).toMatch(/\*\*Checked\*\*: c/);
  });
});


/** Real PostgreSQL semantics: refusing the event must leave no unrecorded business change. */
describe('canon mutations and their account events are atomic', () => {
  let pg: PGlite;
  const input = { organizationId: 3, category: 'terminology', key: 'subject-term', title: 'Subject terminology', content: 'Use subject in this project.', actorId: 41 };
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE account_canon_items (
        id SERIAL PRIMARY KEY, canon_id TEXT UNIQUE NOT NULL, organization_id INTEGER NOT NULL,
        profile_id INTEGER, category TEXT, subcategory TEXT, key TEXT, title TEXT, content TEXT,
        submission_types JSON, module_types JSON, work_types JSON, regulatory_regions JSON,
        version INTEGER, status TEXT, source_type TEXT, source_document_id TEXT, source_description TEXT,
        confidence_score REAL, metadata JSON, created_by_id INTEGER, created_at TIMESTAMP, updated_at TIMESTAMP,
        locked_at TIMESTAMP, locked_by_id INTEGER, superseded_by_id INTEGER
      );
      CREATE TABLE account_events (
        id SERIAL PRIMARY KEY, event_id TEXT UNIQUE, organization_id INTEGER, event_type TEXT,
        canon_item_id INTEGER, skill_bundle_id INTEGER, target_type TEXT, target_id TEXT,
        previous_value JSON, new_value JSON, description TEXT, details JSON, actor_id INTEGER,
        actor_name TEXT, actor_email TEXT, actor_type TEXT, correlation_id TEXT, project_id INTEGER,
        conversation_id INTEGER, ip_address TEXT, created_at TIMESTAMP
      );`);
  });
  afterAll(async () => { await pg?.close(); });
  beforeEach(async () => {
    database.current = pg;
    await pg.exec(`ALTER TABLE account_events DROP CONSTRAINT IF EXISTS refuse_event;
      TRUNCATE account_events, account_canon_items RESTART IDENTITY;
      INSERT INTO account_canon_items (id, canon_id, organization_id, category, key, title, content, version, status)
        VALUES (11, 'canon_existing', 3, 'terminology', 'subject-term', 'Original', 'Original wording', 1, 'draft');`);
  });
  const mutations = [
    { name: 'assert', event: 'account_fact_asserted', act: () => assertCanonFact(input) },
    { name: 'validate', event: 'account_fact_validated', act: () => validateCanonFact(11, 3, 41) },
    { name: 'lock', event: 'account_fact_locked', act: () => lockCanonFact(11, 3, 41) },
    { name: 'supersede', event: 'account_fact_superseded', act: () => supersedeCanonFact(11, input) },
  ];
  it.each(mutations)('$name rolls back the business change when its event is refused', async ({ act }) => {
    const before = (await pg.query('SELECT * FROM account_canon_items ORDER BY id')).rows;
    await pg.exec('ALTER TABLE account_events ADD CONSTRAINT refuse_event CHECK (false) NOT VALID');
    await expect(act()).rejects.toThrow();
    expect((await pg.query('SELECT * FROM account_canon_items ORDER BY id')).rows).toEqual(before);
    expect((await pg.query('SELECT * FROM account_events')).rows).toEqual([]);
    expect(calls.filter(c => /INSERT INTO|UPDATE account_canon|account_events/.test(c.text)).every(c => c.connection === 'transaction')).toBe(true);
    expect(calls.map(c => c.text)).toContain('ROLLBACK');
    expect(database.released).toBe(1);
  });
  it.each(mutations)('$name commits exactly one matching event with its business change', async ({ act, event }) => {
    await act();
    expect((await pg.query('SELECT organization_id, event_type, actor_id FROM account_events')).rows).toEqual([
      { organization_id: 3, event_type: event, actor_id: 41 },
    ]);
    expect(calls.at(-1)?.text).toBe('COMMIT');
    expect(database.released).toBe(1);
  });
  it.each([validateCanonFact, lockCanonFact])('a foreign tenant cannot mutate or record an event for another tenant’s item', async act => {
    await expect(act(11, 9, 41)).rejects.toMatchObject({ statusCode: 404 });
    expect((await pg.query('SELECT status FROM account_canon_items WHERE id = 11')).rows).toEqual([{ status: 'draft' }]);
    expect((await pg.query('SELECT * FROM account_events')).rows).toEqual([]);
  });
});
