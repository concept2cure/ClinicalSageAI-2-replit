/**
 * The SEND column of the study list names each recorded status, and says when
 * no SEND dataset is recorded.
 *
 * What listStudies used to do (until 2026-10-15): a study with no send_datasets
 * row read 'n/a' — as if SEND did not apply — and every status other than
 * 'passed' read 'in progress', so a dataset declared with validator ERRORS was
 * shown as work under way. The real listStudies SQL on PGlite over the 20260610
 * + 20260716 tables.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({ pg: null as unknown as { query: (t: string, p?: unknown[]) => Promise<unknown> } }));
vi.mock('../../../db', () => ({
  pool: { query: (text: string, params?: unknown[]) => h.pg.query(text, params) },
}));

import { listStudies } from '../nonclinical-service';

const sql = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8');

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  h.pg = pg;
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE submissions (id integer PRIMARY KEY);
    CREATE TABLE iacuc_protocols (id integer PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (7);
    INSERT INTO users (id) VALUES (1);
  `);
  await pg.exec(sql('migrations/20260610_nonclinical_send.sql'));
  await pg.exec(sql('db/migrations/20260716_nonclinical_display.sql'));
  await pg.exec(`
    INSERT INTO nonclinical_studies (id, organization_id, study_number, title, study_type, created_by)
      VALUES (1, 7, 'NONE', 'a', 'repeat_dose_tox', 1), (2, 7, 'NOTVAL', 'b', 'repeat_dose_tox', 1),
             (3, 7, 'WARN', 'c', 'repeat_dose_tox', 1), (4, 7, 'ERR', 'd', 'repeat_dose_tox', 1);
    INSERT INTO send_datasets (organization_id, study_id, validation_status, created_by)
      VALUES (7, 2, 'not_validated', 1), (7, 3, 'warnings', 1), (7, 4, 'errors', 1);
  `);
}, 120_000);

afterAll(async () => { await pg?.close(); });

describe('listStudies — each SEND status as recorded', () => {
  it('names a missing dataset and each declared status', async () => {
    const send = Object.fromEntries((await listStudies(7)).map((r) => [r.id, r.send]));
    expect(send).toEqual({
      NONE: 'no SEND dataset recorded',
      NOTVAL: 'not validated',
      WARN: 'declared warnings (not validated by the platform)',
      ERR: 'declared errors (not validated by the platform)',
    });
  });
});
