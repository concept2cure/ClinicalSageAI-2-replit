/**
 * A health-authority meeting (ha_interactions), recorded and moved through
 * Communication (P-39 step 4, 2026-10-30). PGlite, with the table as its
 * migration creates it:
 *   - a meeting names a submission of this organisation or none, never
 *     another tenant's (the foreign key alone admits any id);
 *   - it moves one way, and a move that records a date needs the date;
 *   - the list shows no meeting on a program the reader cannot open.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';

vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));
import { createInteractionTx, listInteractions, updateInteractionStatusTx } from '../ha-service';

const PROGRAM_A = '00000000-0000-4000-8000-00000000000a';
const PROGRAM_B = '00000000-0000-4000-8000-00000000000b';
let pg: PGlite;
const q = { query: (sql: string, params?: unknown[]) => pg.query<any>(sql, params as any[]) };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE submissions (id integer PRIMARY KEY, organization_id integer NOT NULL, program_id uuid, deleted_at timestamptz);
    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO users VALUES (5);
    INSERT INTO submissions VALUES (10, 1, '${PROGRAM_A}', NULL), (11, 1, '${PROGRAM_B}', NULL), (20, 2, '${PROGRAM_A}', NULL);
  `);
  await pg.exec(extractTableDdl('migrations/20260610_ha_interactions_commitments.sql', ['ha_interactions']));
}, 60_000);
afterAll(async () => { await pg?.close(); });

const meeting = (submissionId?: number) => ({ interactionType: 'pre_ind' as const, agency: 'fda' as const, title: 'Pre-IND meeting', submissionId });

describe('recording a meeting', () => {
  it("names this organisation's submission, or none, and never another tenant's", async () => {
    await expect(createInteractionTx(q, 1, 5, meeting(20))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM ha_interactions')).rows[0].n).toBe(0);
    expect((await createInteractionTx(q, 1, 5, meeting(10))).id).toBeGreaterThan(0);
    expect((await createInteractionTx(q, 1, 5, meeting())).id).toBeGreaterThan(0);
  });
});

describe('moving a meeting', () => {
  it('runs one way, needs the date a move records, and does not reopen a closed meeting', async () => {
    const { id } = await createInteractionTx(q, 1, 5, meeting(11));
    await expect(updateInteractionStatusTx(q, 1, id, 'held', { heldDate: '2026-11-02' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(updateInteractionStatusTx(q, 1, id, 'scheduled')).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await updateInteractionStatusTx(q, 1, id, 'scheduled', { scheduledDate: '2026-11-02' });
    await updateInteractionStatusTx(q, 1, id, 'held', { heldDate: '2026-11-02' });
    await updateInteractionStatusTx(q, 1, id, 'minutes_received', { minutesReceivedDate: '2026-12-01' });
    await updateInteractionStatusTx(q, 1, id, 'closed');
    await expect(updateInteractionStatusTx(q, 1, id, 'planned')).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const row = (await pg.query<any>('SELECT status, held_date::text, minutes_received_date::text FROM ha_interactions WHERE id = $1', [id])).rows[0];
    expect(row).toEqual({ status: 'closed', held_date: '2026-11-02', minutes_received_date: '2026-12-01' });
  });

  it("does not move another organisation's meeting", async () => {
    const { id } = await createInteractionTx(q, 1, 5, meeting());
    await expect(updateInteractionStatusTx(q, 2, id, 'requested')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('listing meetings', () => {
  it('shows meetings with no submission and those on programs the reader may open, and no other', async () => {
    const rows = await listInteractions(1, undefined, [PROGRAM_A], q);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.submission_id === null || Number(r.submission_id) === 10)).toBe(true);
    expect(rows.some((r) => Number(r.submission_id) === 11)).toBe(false);
    expect((await listInteractions(1, undefined, [PROGRAM_A, PROGRAM_B], q)).some((r) => Number(r.submission_id) === 11)).toBe(true);
  });
});
