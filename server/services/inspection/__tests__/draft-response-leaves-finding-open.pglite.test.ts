/**
 * Drafting a CAPA response does not mark the Form 483 observation responded.
 *
 * What the code used to do (until 2026-10-15): addResponseTx inserted the
 * response as 'draft' and then set the finding's status to 'responded', although
 * nothing had been submitted to the agency. Nothing in the API submits a
 * response, so every 'responded' finding was a drafted one.
 *
 * Now the finding keeps its status, and listFindings reports the latest
 * response's own status ('draft') beside it.
 *
 * Runs the real service SQL against in-process PGlite with the real migration.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

let pg: PGlite;
const exec = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return { rows: r.rows as any[] };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) } }));

import { createInspectionTx, addFindingTx, addResponseTx, listFindings } from '../inspection-service';

const ORG = 7;
const USER = 3;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO users (id) VALUES (${USER});`);
  await pg.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/20260610_inspection_readiness.sql'), 'utf8'));
}, 120_000);
afterAll(async () => { await pg?.close(); });

describe('addResponseTx', () => {
  it('leaves the finding open and reports the response as a draft', async () => {
    const insp = await createInspectionTx(exec, ORG, USER, { inspectionType: 'bimo', agency: 'fda', siteName: 'Site 12', endDate: '2026-06-10' });
    const f = await addFindingTx(exec, ORG, USER, insp.id, { observationNumber: 1, description: 'Consent version not current', classification: 'major' });
    const untouched = await addFindingTx(exec, ORG, USER, insp.id, { observationNumber: 2, description: 'Delegation log gap', classification: 'minor' });

    const r = await addResponseTx(exec, ORG, USER, f.id, { responseDescription: 'Re-consent all active subjects' });
    expect(r.dueDate).toBe('2026-07-01');

    const rows = await listFindings(ORG, insp.id);
    const byId = new Map(rows.map((x) => [Number(x.id), x]));
    expect(byId.get(f.id)).toMatchObject({ status: 'open', response_status: 'draft' });
    expect(byId.get(untouched.id)).toMatchObject({ status: 'open', response_status: null });
  }, 60_000);
});
