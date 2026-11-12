/**
 * The device change determination names the person who recorded it only as a member of the change's organization
 * (change-regulatory-impact.ts). Against in-process PGlite: a member is named, by name or else by e-mail; a user of
 * another organization is never named on this organization's record, and nothing is kept or audited.
 *
 * The whole act against a real server, with row-level security, is tests/db/p122-device-change-determination.dbtest.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { DEVICE_CHANGE_QUESTIONS } from '../../../../shared/regulatory/change-control-taxonomy';
import type { RequestSqlClient } from '../../../db/requestDb';

const audit = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('../../auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auditService')>()),
  writeChainedAuditRow: async (_q: unknown, row: unknown) => { audit.rows.push(row); },
}));
vi.mock('../../../db', () => ({ pool: { query: async () => ({ rows: [], rowCount: 0 }) } }));

import { recordRegulatoryImpact } from '../change-regulatory-impact';

let pglite: PGlite;
const q: RequestSqlClient = { query: async (sql, params) => ({ rows: (await pglite.query<Record<string, unknown>>(sql, params)).rows }) };
const PROGRAM = '00000000-0000-4000-8000-000000000122';
const ORG = 1;
const MEMBER = 10, NAMELESS = 11, OUTSIDER = 20;
const answers = Object.fromEntries(DEVICE_CHANGE_QUESTIONS.us.map(({ key }) => [key, false]));
const record = (actorId: number) => recordRegulatoryImpact(q, ORG, 1, { market: 'us', answers, actorId }, async () => {});
const kept = async () => (await pglite.query<{ metadata: unknown }>('SELECT metadata FROM qms_change_controls WHERE id = 1')).rows[0].metadata;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE users (id int PRIMARY KEY, name text, email text);
    CREATE TABLE organization_users (organization_id int NOT NULL, user_id int NOT NULL, role text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL, product_type text, deleted_at timestamptz);
    CREATE TABLE qms_change_controls (id serial PRIMARY KEY, organization_id int NOT NULL, change_number text NOT NULL,
      status text NOT NULL DEFAULT 'proposed', program_id uuid, metadata jsonb DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
    INSERT INTO users VALUES (${MEMBER}, 'Member One', 'member@a.invalid'), (${NAMELESS}, ' ', 'nameless@a.invalid'),
      (${OUTSIDER}, 'Outsider Two', 'outsider@b.invalid');
    INSERT INTO organization_users VALUES (${ORG}, ${MEMBER}, 'member'), (${ORG}, ${NAMELESS}, 'member'), (2, ${OUTSIDER}, 'admin');
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}', ${ORG}, 'device', NULL);`);
});
afterAll(async () => { await pglite?.close(); });
beforeEach(async () => {
  audit.rows.length = 0;
  await pglite.exec(`TRUNCATE qms_change_controls RESTART IDENTITY;
    INSERT INTO qms_change_controls (organization_id, change_number, program_id) VALUES (${ORG}, 'CC-0001', '${PROGRAM}');`);
});

describe('who recorded the device change determination', () => {
  it('names a member of the organization on the record and in its audit row', async () => {
    const recorded = await record(MEMBER);
    expect(recorded.determination.by).toEqual({ id: MEMBER, name: 'Member One' });
    expect(await kept()).toMatchObject({ regulatoryImpact: { us: { by: { id: MEMBER, name: 'Member One' } } } });
    expect(audit.rows).toHaveLength(1);
  });

  it('names a member with no name by their e-mail', async () => {
    expect((await record(NAMELESS)).determination.by).toEqual({ id: NAMELESS, name: 'nameless@a.invalid' });
  });

  it('never names a user of another organization: nothing is kept or audited', async () => {
    await expect(record(OUTSIDER)).rejects.toThrow('could not be read');
    expect(await kept()).toEqual({});
    expect(audit.rows).toHaveLength(0);
  });
});
