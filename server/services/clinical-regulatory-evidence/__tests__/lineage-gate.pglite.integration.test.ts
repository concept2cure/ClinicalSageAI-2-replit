/**
 * Author-lineage gate — END-TO-END against in-process PGlite with the real
 * migrations. Verifies the single chokepoint every authored-content write uses:
 *
 *   - empty content is a no-op (an empty scaffold has nothing to attribute)
 *   - real content records an author span per clause and passes the coverage
 *     assertion (so the caller's transaction is allowed to commit)
 *   - re-writing the same content converges instead of accumulating spans
 *   - the whole thing runs on a caller-supplied `exec`, which is how the gate
 *     shares one transaction with the content write
 *
 * One PGlite instance for the file.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const exec = {
  query: async <R = any>(sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as R[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
// span-lineage.service reads `pool` for its default executor; the gate always
// passes an explicit exec, but the import graph still resolves ../../../db.
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) } }));

import { enforceAuthorLineage } from '../lineage-gate';

const ORG = 711;
const REF = { documentTable: 'authoring_sections', documentId: 'sec-gate-1' };
const ACTOR = '4242';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function spanCount(documentId: string): Promise<number> {
  const { rows } = await exec.query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = $2 AND document_id = $3
        AND deleted_at IS NULL`,
    [ORG, REF.documentTable, documentId],
  );
  return Number((rows[0] as any).n);
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a');`);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('enforceAuthorLineage', () => {
  it('is a no-op for empty content — records nothing, does not throw', async () => {
    await expect(enforceAuthorLineage(exec, ORG, REF, '', ACTOR)).resolves.toBeUndefined();
    await expect(enforceAuthorLineage(exec, ORG, REF, null, ACTOR)).resolves.toBeUndefined();
    await expect(enforceAuthorLineage(exec, ORG, REF, undefined, ACTOR)).resolves.toBeUndefined();
    expect(await spanCount(REF.documentId)).toBe(0);
  });

  it('records author spans covering real content and passes the coverage assertion', async () => {
    const ref = { documentTable: 'authoring_sections', documentId: 'sec-gate-2' };
    const content =
      'The primary endpoint was confirmed ORR. Secondary endpoints included PFS and OS.';
    await expect(enforceAuthorLineage(exec, ORG, ref, content, ACTOR)).resolves.toBeUndefined();
    const { rows } = await exec.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM document_span_lineage
        WHERE organization_id = $1 AND document_table = $2 AND document_id = $3
          AND deleted_at IS NULL`,
      [ORG, ref.documentTable, ref.documentId],
    );
    expect(Number((rows[0] as any).n)).toBeGreaterThan(0);
  });

  it('converges on re-write of identical content (no span accumulation)', async () => {
    const ref = { documentTable: 'authoring_sections', documentId: 'sec-gate-3' };
    const content = 'Efficacy was evaluated in a single-arm study. The RP2D was 12 mg/kg.';
    await enforceAuthorLineage(exec, ORG, ref, content, ACTOR);
    const first = (
      await exec.query<{ n: string }>(
        `SELECT COUNT(*)::int AS n FROM document_span_lineage
          WHERE organization_id = $1 AND document_table = $2 AND document_id = $3
            AND deleted_at IS NULL`,
        [ORG, ref.documentTable, ref.documentId],
      )
    ).rows[0];
    await enforceAuthorLineage(exec, ORG, ref, content, ACTOR);
    const second = (
      await exec.query<{ n: string }>(
        `SELECT COUNT(*)::int AS n FROM document_span_lineage
          WHERE organization_id = $1 AND document_table = $2 AND document_id = $3
            AND deleted_at IS NULL`,
        [ORG, ref.documentTable, ref.documentId],
      )
    ).rows[0];
    expect(Number((second as any).n)).toBe(Number((first as any).n));
  });
});
