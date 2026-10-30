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
import fs from 'node:fs';
import path from 'node:path';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';

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
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, regulatory_program_id uuid, status text);
    INSERT INTO projects VALUES (100, 1, '${PROGRAM_A}', 'active'), (101, 1, '${PROGRAM_B}', 'active');
    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO users VALUES (5);
    INSERT INTO submissions VALUES (10, 1, '${PROGRAM_A}', NULL), (11, 1, '${PROGRAM_B}', NULL), (20, 2, '${PROGRAM_A}', NULL);
  `);
  await pg.exec(extractTableDdl('migrations/20260610_ha_interactions_commitments.sql', ['ha_interactions']));
  await pg.exec(extractTableDdl('db/migrations/20260331_communication_center_scaffold.sql', ['concept2cure_agency_communications']));
  const minutesLink = fs.readFileSync(path.join(REPO_ROOT, 'migrations/20261030_ha_interaction_minutes_letter.sql'), 'utf8');
  await pg.exec(minutesLink);
  await pg.exec(minutesLink); // replayed on every deploy
  const letter = (id: string, project: number, source: string) =>
    `('${id}', 1, ${project}, '${source}', 'Meeting minutes', 'email', 'medium', 'pending', 'open', '{}'::jsonb)`;
  await pg.exec(`INSERT INTO concept2cure_agency_communications
    (event_id, organization_id, project_id, source_type, communication_type, source_channel, urgency, human_review_status, closure_status, audit_metadata)
    VALUES ${letter('ace_minutes_a', 100, 'meeting_minutes')}, ${letter('ace_ir_a', 100, 'information_request')}, ${letter('ace_minutes_b', 101, 'meeting_minutes')}`);
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

describe("naming a meeting's minutes (P-39 step 4c)", () => {
  async function heldMeeting(submissionId?: number) {
    const { id } = await createInteractionTx(q, 1, 5, meeting(submissionId));
    await updateInteractionStatusTx(q, 1, id, 'scheduled', { scheduledDate: '2026-11-02' });
    await updateInteractionStatusTx(q, 1, id, 'held', { heldDate: '2026-11-02' });
    return id;
  }

  it("names this project's minutes letter when the minutes are received, and nothing else", async () => {
    const id = await heldMeeting(10);
    const minutes = (eventId: string) => updateInteractionStatusTx(q, 1, id, 'minutes_received', { minutesReceivedDate: '2026-12-01', minutesEventId: eventId });
    await expect(minutes('ace_ir_a')).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await expect(minutes('ace_minutes_b')).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await expect(minutes('ace_nowhere')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await minutes('ace_minutes_a');
    expect((await pg.query<any>('SELECT minutes_event_id FROM ha_interactions WHERE id = $1', [id])).rows[0].minutes_event_id).toBe('ace_minutes_a');
    expect((await listInteractions(1, undefined, [PROGRAM_A], q)).find((r) => r.id === id)).toMatchObject({ minutes_event_id: 'ace_minutes_a', project_id: 100 });
  });

  it('refuses a minutes letter on a meeting that names no submission, or on any other move', async () => {
    const orgLevel = await heldMeeting();
    await expect(updateInteractionStatusTx(q, 1, orgLevel, 'minutes_received', { minutesReceivedDate: '2026-12-01', minutesEventId: 'ace_minutes_a' }))
      .rejects.toMatchObject({ code: 'BAD_INPUT' });
    const { id } = await createInteractionTx(q, 1, 5, meeting(10));
    await expect(updateInteractionStatusTx(q, 1, id, 'requested', { minutesEventId: 'ace_minutes_a' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });

  it('clears the link when the letter is purged, and never blocks the purge', async () => {
    const id = await heldMeeting(11);
    await updateInteractionStatusTx(q, 1, id, 'minutes_received', { minutesReceivedDate: '2026-12-01', minutesEventId: 'ace_minutes_b' });
    await pg.query(`DELETE FROM concept2cure_agency_communications WHERE event_id = 'ace_minutes_b'`);
    expect((await pg.query<any>('SELECT minutes_event_id FROM ha_interactions WHERE id = $1', [id])).rows[0].minutes_event_id).toBeNull();
  });
});

