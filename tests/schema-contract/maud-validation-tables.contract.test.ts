/**
 * Schema contract: MAUD validation persistence tables (G-02).
 *
 * server/db/maudDb.ts read/wrote maud_algorithms / maud_validations /
 * maud_validation_requests, but the only CREATE TABLE lived in the ARCHIVED
 * db/migrations/_consolidated/ (excluded from the scanners, on no apply path),
 * so on a fresh database the MAUD routes 500/no-op and the tables sat on the
 * unbacked-tables baseline. db/migrations/20260728_maud_validation_tables.sql is
 * the canonical durable definition.
 *
 * This suite applies that migration to real Postgres (PGlite) and runs the EXACT
 * queries maudDb.ts issues — the three `ON CONFLICT` upserts and the
 * `organization_id`-filtered reads — proving the reconstruction matches the code
 * AND that the explicit tenant filter isolates organizations.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = 'db/migrations/20260728_maud_validation_tables.sql';
let db: PGlite;
const q = (sql: string, params?: unknown[]) => db.query(sql, params as unknown[]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.resolve(MIGRATION), 'utf8'));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

// maudDb.ts saveValidation()
const saveValidation = (v: Record<string, unknown>) =>
  q(
    `INSERT INTO maud_validations (
       validation_id, document_id, organization_id, status, timestamp,
       score, validator_name, validator_version, regulatory_frameworks,
       algorithms_used, validation_details
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (validation_id) DO UPDATE SET
       status = EXCLUDED.status, timestamp = EXCLUDED.timestamp, score = EXCLUDED.score,
       validator_name = EXCLUDED.validator_name, validator_version = EXCLUDED.validator_version,
       regulatory_frameworks = EXCLUDED.regulatory_frameworks,
       algorithms_used = EXCLUDED.algorithms_used, validation_details = EXCLUDED.validation_details
     RETURNING *`,
    [
      v.validation_id, v.document_id, v.organization_id ?? null, v.status, new Date(),
      v.score ?? null, v.validator_name ?? null, v.validator_version ?? null,
      JSON.stringify(v.regulatory_frameworks ?? []), JSON.stringify(v.algorithms_used ?? []),
      JSON.stringify(v.validation_details ?? {}),
    ],
  );

describe('MAUD validation tables (G-02) match the code', () => {
  it('saveValidation upserts on validation_id and returns the row', async () => {
    const r1 = await saveValidation({ validation_id: 'V1', document_id: 'D1', organization_id: 'orgA', status: 'passed', score: 90 });
    expect(r1.rows.length).toBe(1);
    // second call with the same validation_id UPDATES (no unique violation)
    const r2 = await saveValidation({ validation_id: 'V1', document_id: 'D1', organization_id: 'orgA', status: 'failed', score: 10 });
    expect((r2.rows[0] as { status: string }).status).toBe('failed');
    const all = await q(`SELECT count(*)::int AS n FROM maud_validations WHERE validation_id = 'V1'`);
    expect((all.rows[0] as { n: number }).n).toBe(1);
  });

  it('getValidationStatus / history are isolated by organization_id', async () => {
    await saveValidation({ validation_id: 'V-A', document_id: 'DOC', organization_id: 'orgA', status: 'passed' });
    await saveValidation({ validation_id: 'V-B', document_id: 'DOC', organization_id: 'orgB', status: 'passed' });

    // getValidationStatus(documentId, organizationId)
    const a = await q(
      `SELECT * FROM maud_validations WHERE document_id = $1 AND organization_id = $2 ORDER BY timestamp DESC LIMIT 1`,
      ['DOC', 'orgA'],
    );
    expect(a.rows.length).toBe(1);
    expect((a.rows[0] as { validation_id: string }).validation_id).toBe('V-A');

    // org C sees nothing for the same document — the explicit filter isolates tenants
    const c = await q(
      `SELECT * FROM maud_validations WHERE document_id = $1 AND organization_id = $2 ORDER BY timestamp DESC LIMIT 1`,
      ['DOC', 'orgC'],
    );
    expect(c.rows.length).toBe(0);

    // getValidationHistory(documentId, organizationId, limit)
    const hist = await q(
      `SELECT * FROM maud_validations WHERE document_id = $1 AND organization_id = $2 ORDER BY timestamp DESC LIMIT $3`,
      ['DOC', 'orgB', 20],
    );
    expect(hist.rows.length).toBe(1);
    expect((hist.rows[0] as { validation_id: string }).validation_id).toBe('V-B');
  });

  it('saveValidationRequest upserts on request_id; getPendingRequests filters by org + status', async () => {
    await q(
      `INSERT INTO maud_validation_requests (request_id, document_id, organization_id, status, algorithms, metadata, estimated_completion_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (request_id) DO UPDATE SET status = EXCLUDED.status, algorithms = EXCLUDED.algorithms,
         metadata = EXCLUDED.metadata, estimated_completion_time = EXCLUDED.estimated_completion_time
       RETURNING *`,
      ['R1', 'DOC', 'orgA', 'pending', JSON.stringify([]), JSON.stringify({}), null],
    );
    const pending = await q(
      `SELECT * FROM maud_validation_requests WHERE document_id = $1 AND organization_id = $2
         AND status IN ('pending','submitted','in_progress') ORDER BY created_at DESC`,
      ['DOC', 'orgA'],
    );
    expect(pending.rows.length).toBe(1);
    // another org sees no pending requests for the same document
    const other = await q(
      `SELECT * FROM maud_validation_requests WHERE document_id = $1 AND organization_id = $2
         AND status IN ('pending','submitted','in_progress') ORDER BY created_at DESC`,
      ['DOC', 'orgZ'],
    );
    expect(other.rows.length).toBe(0);
  });

  it('saveAlgorithm upserts on algorithm_id; getAvailableAlgorithms lists them', async () => {
    await q(
      `INSERT INTO maud_algorithms (algorithm_id, name, version, description, validation_level, regulatory_frameworks)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (algorithm_id) DO UPDATE SET name = EXCLUDED.name, version = EXCLUDED.version,
         description = EXCLUDED.description, validation_level = EXCLUDED.validation_level,
         regulatory_frameworks = EXCLUDED.regulatory_frameworks
       RETURNING *`,
      ['ALG1', 'Assay Check', '1.0', 'desc', 'high', JSON.stringify(['FDA'])],
    );
    const list = await q(`SELECT * FROM maud_algorithms ORDER BY name ASC`);
    expect(list.rows.length).toBeGreaterThanOrEqual(1);
  });
});
