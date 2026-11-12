/**
 * verifySequencedRow: one chained audit row checked in place.
 *
 * 2026-11-12. A reader on node-postgres holds the row's `occurred_at` as a
 * Date. A reader on drizzle's `execute` (db/drizzle-queryable.ts) holds the
 * same instant as PostgreSQL's text, `2026-11-12 00:36:03.117+00`. The writer
 * hashed the ISO form, so the text re-derived another hash and every row read
 * that way was reported broken. Found in the running app: an approved document
 * with current independent checks was refused 409 INDEPENDENT_CHECK_REQUIRED
 * when placed into a sequence (coauthor-snapshot.ts reads on the request's
 * drizzle connection), while the same check read `current` on the pg pool.
 * PGlite returns a Date on both paths, so no in-memory suite could see it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveChainHash, type PoolClient } from '../chain';
import { verifySequencedRow } from '../chain-row';

const AT = new Date('2026-11-12T00:36:03.117Z');
const PREVIOUS = 'b'.repeat(64);
const base = { action: 'authoring.section.update', actor_id: 7, target: 'authoring_document:5a4d5989', payload_hash: 'a'.repeat(64) };
const STORED = deriveChainHash({ ...base, occurred_at: AT }, PREVIOUS);
const client = { query: async () => ({ rows: [{ sha256_chain: PREVIOUS }] }) } as unknown as PoolClient;
const row = (occurred_at: string | Date) => ({ ...base, occurred_at, tenant_id: 2, sha256_chain: STORED, hmac_seal: null, chain_seq: 12 });

beforeEach(() => { vi.stubEnv('AUDIT_HMAC_KEY', undefined); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('verifySequencedRow reads the instant the writer hashed, however the driver hands it over', () => {
  it.each([
    ['a Date (node-postgres)', AT],
    ['the ISO string', '2026-11-12T00:36:03.117Z'],
    ['PostgreSQL text (drizzle execute)', '2026-11-12 00:36:03.117+00'],
    ['PostgreSQL text with microseconds', '2026-11-12 00:36:03.117000+00'],
    ['PostgreSQL text in another zone', '2026-11-12 06:06:03.117+05:30'],
  ])('%s is linked', async (_name, occurredAt) => {
    expect(await verifySequencedRow(client, row(occurredAt))).toEqual({ link: 'linked', seal: 'no-key' });
  });

  it.each([
    ['another instant, as a Date', new Date('2026-11-12T00:36:04.117Z')],
    ['another instant, as PostgreSQL text', '2026-11-12 00:36:04.117+00'],
    ['text that is no timestamp', 'yesterday'],
  ])('%s is still broken', async (_name, occurredAt) => {
    expect((await verifySequencedRow(client, row(occurredAt))).link).toBe('broken');
  });
});
