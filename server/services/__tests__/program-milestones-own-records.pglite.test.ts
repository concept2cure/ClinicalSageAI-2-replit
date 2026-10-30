/**
 * A program's milestones come from that program's own records.
 *
 * getMilestones derived "eSTAR drafted" and "Internal QC" from the eSTAR
 * sections of the whole organization (cerv2_510k_sections has no program
 * link), marked Internal QC complete at 90% drafted with no QC recorded,
 * showed the target submission date as the filing date, and showed "AI
 * acknowledgement: Received" whenever the program's status said filed.
 *
 * Tables from their drizzle definitions, on PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import { cerv2510kSections, submissionTransmittals } from '../../../shared/schema';
import { qSubmissions, qSubMeetings } from '../../../shared/schema/q-sub';

const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
const dbDouble = vi.hoisted(() => ({
  get db() { return holder.db; },
  pool: { query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) },
  getDb: () => holder.db,
  getPool: () => ({ query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) }),
}));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);

import { getMilestones } from '../regulatory-programs.service';

/** CREATE TABLE from the drizzle definition (columns and types only). */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

const ORG = 1;
const FILED = '11111111-1111-4111-8111-111111111111';     // status submitted, no transmittal
const SENT = '22222222-2222-4222-8222-222222222222';      // a transmittal, acknowledged
const PLANNED = '33333333-3333-4333-8333-333333333333';   // not filed, target date set

beforeAll(async () => {
  holder.pg = new PGlite();
  holder.db = drizzle(holder.pg);
  for (const t of [regulatoryPrograms, cerv2510kSections, submissionTransmittals, qSubmissions, qSubMeetings]) {
    await holder.pg.exec(ddlOf(t as PgTable));
  }
  const program = (id: string, status: string, target: string | null) => holder.pg.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, program_type, status, phase, target_submission_date)
     VALUES ($1, $2, 'P', 'device', $3, 'development', $4)`,
    [id, ORG, status, target],
  );
  await program(FILED, 'submitted', '2026-11-01');
  await program(SENT, 'active', '2026-11-01');
  await program(PLANNED, 'active', '2026-12-15');
  // The organization's eSTAR sections — no program's in particular, all validated.
  for (let i = 0; i < 10; i++) {
    await holder.pg.query(
      `INSERT INTO cerv2_510k_sections (id, organization_id, section_number, section_title, section_key, category, display_order, status)
       VALUES ($1, $2, $3, 'S', $4, 'Device', $1, 'validated')`,
      [i + 1, ORG, `${i + 1}.0`, `s${i}`],
    );
  }
  await holder.pg.query(
    `INSERT INTO submission_transmittals (id, organization_id, program_id, region, gateway, format, status, submitted_at, ack_received_at)
     VALUES (1, $1, $2, 'fda', 'esg', 'estar', 'received', '2026-09-01T10:00:00Z', '2026-09-02T09:00:00Z')`,
    [ORG, SENT],
  );
}, 60_000);

afterAll(async () => { await holder.pg?.close(); });

const byId = (ms: Awaited<ReturnType<typeof getMilestones>>) => Object.fromEntries((ms ?? []).map((m) => [m.id, m]));

describe("a program's milestones", () => {
  it("do not take the organization's eSTAR sections as this program's, or invent a QC", async () => {
    const m = byId(await getMilestones(ORG, PLANNED));
    expect(m['m-estar']).toMatchObject({ state: 'not_recorded', date: 'Not recorded for this project' });
    expect(m['m-internal-qc']).toMatchObject({ state: 'not_recorded' });
  });

  it('do not show an acknowledgement because the status says filed', async () => {
    const m = byId(await getMilestones(ORG, FILED));
    expect(m['m-filing']).toMatchObject({ state: 'complete', date: 'Filed (date not recorded)' });
    expect(m['m-ack']).toMatchObject({ state: 'not_recorded', date: 'Not recorded' });
  });

  it("date the filing and the acknowledgement from the program's transmittal", async () => {
    const m = byId(await getMilestones(ORG, SENT));
    expect(m['m-filing']).toMatchObject({ state: 'complete', date: '2026-09-01' });
    expect(m['m-ack']).toMatchObject({ state: 'complete', date: '2026-09-02' });
  });

  it('show a target date as a target, not as the filing date', async () => {
    const m = byId(await getMilestones(ORG, PLANNED));
    expect(m['m-filing']).toMatchObject({ state: 'idle', date: 'Target 2026-12-15' });
    expect(m['m-ack']).toMatchObject({ state: 'idle', date: 'Pending' });
  });
});
