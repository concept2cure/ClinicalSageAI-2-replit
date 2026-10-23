/**
 * A SEND validation status the user declared is labelled as declared, not as
 * conformance.
 *
 * What listStudies used to do: `WHEN sd.validation_status = 'passed' THEN
 * 'conforms'`. That status is whatever the caller PUT to
 * /api/nonclinical/studies/:id/send (validationStatus 'passed' and the
 * validator counts are accepted as stated); no validator ran on the platform.
 * The nonclinical review board printed it as "SEND conforms", and AnA received
 * it as the study's sendStatus. The real listStudies SQL runs here on PGlite
 * over the 20260610 + 20260716 tables.
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
      VALUES (1, 7, 'TX-701', '26-week rat', 'repeat_dose_tox', 1),
             (2, 7, 'TX-702', '4-week dog',  'repeat_dose_tox', 1);
    INSERT INTO send_datasets (organization_id, study_id, validation_status, created_by)
      VALUES (7, 1, 'passed', 1), (7, 2, 'not_validated', 1);
  `);
}, 120_000);

afterAll(async () => { await pg?.close(); });

describe('listStudies — the SEND column says what the platform knows', () => {
  it('labels a user-declared "passed" as declared, not as conformance', async () => {
    const rows = await listStudies(7);
    const declared = rows.find((r) => r.id === 'TX-701');
    expect(declared?.send, 'a status the user declared was shown as SEND conformance').toBe(
      'declared passed (not validated by the platform)',
    );
    // 2026-10-15: pinned 'in progress' for 'not_validated'; it now reads as recorded.
    expect(rows.find((r) => r.id === 'TX-702')?.send).toBe('not validated');
  });
});
