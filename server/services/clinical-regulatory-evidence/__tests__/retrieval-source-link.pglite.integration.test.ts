/**
 * Phase 2 cross-registry link — END-TO-END against in-process PGlite.
 *
 * Proves resolveEvidenceSourceIdsByArtifact honestly maps a retrieval artifact
 * id (lumen_data_atoms.source_id) to the canonical cre_evidence_sources.id via
 * `metadata->>'artifactId'`, against the real spine migration:
 *
 *   - an artifact id recorded on a source's metadata resolves to that source id;
 *   - an artifact id with NO canonical source resolves to nothing (honest — no
 *     id is invented, so no span can cite a source that does not exist);
 *   - the resolution is tenant-scoped: org A never resolves org B's source.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const pool = {
  query: async <R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as R[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

import {
  resolveEvidenceSourceIdsByArtifact,
  resolveEvidenceSourceId,
} from '../retrieval-source-link';

const ORG_A = 711;
const ORG_B = 822;

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

/**
 * A Data Room source as routes/chat/upload.ts writes it: the artifact id lives
 * on `metadata.artifactId` (the same id the atom carries as source_id).
 */
async function makeSourceWithArtifact(orgId: number, artifactId: string, title = 'upload.pdf'): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO cre_evidence_sources
       (organization_id, visibility_class, source_type, title, checksum,
        ingestion_status, extraction_status, metadata)
     VALUES ($1, 'tenant_private', 'client_document', $2, $3, 'ingested', 'extracted',
             $4::jsonb)
     RETURNING id`,
    [orgId, title, `sum-${artifactId}`, JSON.stringify({ artifactId })],
  );
  return (rows[0] as { id: number }).id;
}

let idA1: number;
let idA2: number;
let idB3: number;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG_A},'a'), (${ORG_B},'b');`);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));

  idA1 = await makeSourceWithArtifact(ORG_A, 'art-1');
  idA2 = await makeSourceWithArtifact(ORG_A, 'art-2');
  idB3 = await makeSourceWithArtifact(ORG_B, 'art-3');
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('resolveEvidenceSourceIdsByArtifact — the Phase 2 cross-registry link', () => {
  it('maps artifact ids to their canonical cre_evidence_sources.id', async () => {
    const map = await resolveEvidenceSourceIdsByArtifact(ORG_A, ['art-1', 'art-2'], pool);
    expect(map.get('art-1')).toBe(idA1);
    expect(map.get('art-2')).toBe(idA2);
    expect(map.size).toBe(2);
  });

  it('resolves an artifact with no canonical source to NOTHING (honest — no invented id)', async () => {
    const map = await resolveEvidenceSourceIdsByArtifact(ORG_A, ['art-does-not-exist'], pool);
    expect(map.size).toBe(0);
    expect(await resolveEvidenceSourceId(ORG_A, 'art-does-not-exist', pool)).toBeNull();
  });

  it('is tenant-scoped: org A never resolves org B\'s source', async () => {
    const map = await resolveEvidenceSourceIdsByArtifact(ORG_A, ['art-3'], pool);
    expect(map.has('art-3')).toBe(false);
    // ...but org B does resolve its own.
    expect(await resolveEvidenceSourceId(ORG_B, 'art-3', pool)).toBe(idB3);
  });

  it('mixes resolvable + unresolvable ids in one batch, returning only the real ones', async () => {
    const map = await resolveEvidenceSourceIdsByArtifact(
      ORG_A,
      ['art-1', 'art-3', 'art-missing', '', 'art-2'],
      pool,
    );
    // art-1/art-2 real for A; art-3 is org B; art-missing/'' have no source.
    expect([...map.entries()].sort()).toEqual([
      ['art-1', idA1],
      ['art-2', idA2],
    ]);
  });

  it('returns empty for invalid inputs without querying', async () => {
    expect((await resolveEvidenceSourceIdsByArtifact(0, ['art-1'], pool)).size).toBe(0);
    expect((await resolveEvidenceSourceIdsByArtifact(ORG_A, [], pool)).size).toBe(0);
    expect(await resolveEvidenceSourceId(ORG_A, null, pool)).toBeNull();
  });
});
