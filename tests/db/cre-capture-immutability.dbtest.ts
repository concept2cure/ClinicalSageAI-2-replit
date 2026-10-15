/**
 * The data room's capture record is append-only (VR-16, rows D2 and D5).
 *
 * cre_evidence_sources records what was captured, with which bytes, and which
 * capture each one revises. The checksum was "written once" only by
 * convention, so any UPDATE could rewrite it, re-point a revision, or bring a
 * retired capture back, and "filed" or "changed since cited" could then be
 * falsified. Here, as the runtime role in a tenant's scope with RLS on:
 *
 *   - checksum, previous_version_id and the project scope are write-once;
 *     organization_id, source_type and created_at never change;
 *   - is_current goes TRUE → FALSE, never back;
 *   - DELETE and TRUNCATE are refused;
 *   - control: createSupersedingSource still retires its predecessor, and the
 *     mutable columns still change.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vr16 ';
const SUM = (c: string) => c.repeat(64);

let owner: Pool;
let org: { id: number; uuid: string };

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** Run as the runtime role, in this organization's tenant scope. */
async function asTenant<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  return runWithTenantScope(
    { tenantId: String(org.id), orgUuid: org.uuid, role: 'admin', source: 'request', caller: 'tests/db/cre-capture-immutability.dbtest.ts' },
    () => fn(pool as unknown as Q),
  );
}

/** A captured source, written as the owner (the fixture is not under test). */
async function source(checksum: string | null, extra: Record<string, unknown> = {}): Promise<number> {
  const cols = ['organization_id', 'source_type', 'title', 'checksum', ...Object.keys(extra)];
  const vals = [org.id, 'client_document', `${PROBE}source`, checksum, ...Object.values(extra)];
  const { rows } = await owner.query(
    `INSERT INTO cre_evidence_sources (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    vals,
  );
  return Number(rows[0].id);
}

const refused = /IMMUTABILITY_VIOLATION/;

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const o = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, 'dbtest-vr16')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}org`],
  );
  org = { id: Number(o.rows[0].id), uuid: String(o.rows[0].uuid) };
}, 60_000);

afterAll(async () => {
  // The capture record is append-only for every role but its owner, which is
  // what this cleanup runs as.
  await owner.query('DELETE FROM cre_evidence_sources WHERE organization_id = $1 AND previous_version_id IS NOT NULL', [org.id]).catch(() => {});
  await owner.query('DELETE FROM cre_evidence_sources WHERE organization_id = $1', [org.id]).catch(() => {});
  await owner.end().catch(() => {});
});

describe('the capture record cannot be rewritten (VR-16)', () => {
  it('a recorded checksum cannot be changed or cleared; a missing one can be set once', async () => {
    const id = await source(SUM('a'));
    await expect(asTenant((q) => q.query('UPDATE cre_evidence_sources SET checksum = $1 WHERE id = $2', [SUM('b'), id]))).rejects.toThrow(refused);
    await expect(asTenant((q) => q.query('UPDATE cre_evidence_sources SET checksum = NULL WHERE id = $1', [id]))).rejects.toThrow(refused);
    const late = await source(null);
    await asTenant((q) => q.query('UPDATE cre_evidence_sources SET checksum = $1 WHERE id = $2', [SUM('c'), late]));
    await expect(asTenant((q) => q.query('UPDATE cre_evidence_sources SET checksum = $1 WHERE id = $2', [SUM('d'), late]))).rejects.toThrow(refused);
  });

  it('a revision link, a project scope, the organization and the source type do not change', async () => {
    const first = await source(SUM('e'));
    const other = await source(SUM('f'));
    const next = await source(SUM('1'), { previous_version_id: first });
    await expect(asTenant((q) => q.query('UPDATE cre_evidence_sources SET previous_version_id = $1 WHERE id = $2', [other, next]))).rejects.toThrow(refused);
    await expect(asTenant((q) => q.query('UPDATE cre_evidence_sources SET source_type = $1 WHERE id = $2', ['agency_document', first]))).rejects.toThrow(refused);
    // Even the owner cannot move a capture to another organization. Rolled back, so a
    // database without the guard keeps its row where it was.
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await expect(c.query('UPDATE cre_evidence_sources SET organization_id = $1 WHERE id = $2', [org.id + 1, first])).rejects.toThrow(refused);
    } finally {
      await c.query('ROLLBACK').catch(() => undefined);
      c.release();
    }
    const scoped = await source(SUM('2'), { client_workspace_id: 12 });
    await expect(asTenant((q) => q.query('UPDATE cre_evidence_sources SET client_workspace_id = 13 WHERE id = $1', [scoped]))).rejects.toThrow(refused);
  });

  it('a superseded capture cannot be made current again', async () => {
    const id = await source(SUM('3'));
    await asTenant((q) => q.query('UPDATE cre_evidence_sources SET is_current = FALSE WHERE id = $1', [id]));
    await expect(asTenant((q) => q.query('UPDATE cre_evidence_sources SET is_current = TRUE WHERE id = $1', [id]))).rejects.toThrow(refused);
  });

  it('a capture cannot be deleted, and the record cannot be truncated', async () => {
    const id = await source(SUM('4'));
    await expect(asTenant((q) => q.query('DELETE FROM cre_evidence_sources WHERE id = $1', [id]))).rejects.toThrow(refused);
    // TRUNCATE is refused for every role, the owner included. Inside a rolled-back
    // transaction, so a database without the guard loses nothing.
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      // CASCADE: without it the table's foreign keys refuse first, which says nothing about the guard.
      await expect(c.query('TRUNCATE cre_evidence_sources CASCADE')).rejects.toThrow(refused);
    } finally {
      await c.query('ROLLBACK').catch(() => undefined);
      c.release();
    }
    expect((await owner.query('SELECT 1 FROM cre_evidence_sources WHERE id = $1', [id])).rows).toHaveLength(1);
  });
});

describe('the writers still work (VR-16 controls)', () => {
  it('createSupersedingSource retires the predecessor and links the revision', async () => {
    const { createSource, createSupersedingSource } = await import(
      '../../server/services/clinical-regulatory-evidence/evidence-spine.service'
    );
    const before = await asTenant(() => createSource(org.id, { sourceType: 'client_document', title: `${PROBE}v1`, checksum: SUM('5') }));
    const { source: after, supersededId } = await asTenant(() =>
      createSupersedingSource(org.id, { sourceType: 'client_document', title: `${PROBE}v2`, checksum: SUM('6') }, before.id),
    );
    expect(supersededId).toBe(before.id);
    const rows = (await owner.query('SELECT id, is_current, previous_version_id FROM cre_evidence_sources WHERE id = ANY($1::int[]) ORDER BY id', [[before.id, after.id]])).rows;
    expect(rows).toEqual([
      { id: before.id, is_current: false, previous_version_id: null },
      { id: after.id, is_current: true, previous_version_id: before.id },
    ]);
  });

  it('a mutable column still changes', async () => {
    const id = await source(SUM('7'));
    await asTenant((q) => q.query(`UPDATE cre_evidence_sources SET extraction_status = 'extracted', title = $1 WHERE id = $2`, [`${PROBE}renamed`, id]));
    expect((await owner.query('SELECT extraction_status FROM cre_evidence_sources WHERE id = $1', [id])).rows[0].extraction_status).toBe('extracted');
  });
});
