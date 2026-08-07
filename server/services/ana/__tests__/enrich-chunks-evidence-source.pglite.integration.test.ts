/**
 * Phase 2b boundary wiring — enrichChunksWithArtifactMetadata stamps the
 * resolved cre_evidence_sources.id onto each RetrievedChunk, against PGlite.
 *
 * Proves the generation-boundary glue: an atom whose upload created a canonical
 * source (cre_evidence_sources.metadata->>'artifactId' === the atom's source_id)
 * gets evidenceSourceId set; an atom with no canonical source stays undefined
 * (honest silence); resolution is tenant-scoped (the org comes from the
 * project's own artifacts). The resolver itself is unit-proven separately in
 * clinical-regulatory-evidence/__tests__/retrieval-source-link.pglite.integration.test.ts;
 * this proves it is wired correctly at the boundary that feeds source-attribution.
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
// submission-chat-handler reads the pool via getPool() (db/runtime); the resolver
// reads `pool` from db. Point both at the same in-process PGlite.
vi.mock('../../../db/runtime.js', () => ({ getPool: () => pool }));
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

import { enrichChunksWithArtifactMetadata, type ArtifactRow } from '../submission-chat-handler';

const ORG = 4242;

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

// Deterministic uuids (lumen_data_atoms.id is uuid, not serial).
const ATOM_RESOLVABLE = '11111111-1111-1111-1111-111111111111';
const ATOM_NO_SOURCE = '22222222-2222-2222-2222-222222222222';
const ART_RESOLVABLE = 'artifact-with-source';
const ART_NO_SOURCE = 'artifact-without-source';

let evidenceSourceId: number;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'org');`);
  // Minimal lumen_data_atoms — enrich only reads id/source_type/source_id/metadata.
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS lumen_data_atoms (
      id uuid PRIMARY KEY,
      source_type text,
      source_id text,
      metadata jsonb
    );`);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));

  await pool.query(
    `INSERT INTO lumen_data_atoms (id, source_type, source_id, metadata) VALUES
       ($1, 'chat_upload', $2, '{}'::jsonb),
       ($3, 'data_room_upload', $4, '{}'::jsonb)`,
    [ATOM_RESOLVABLE, ART_RESOLVABLE, ATOM_NO_SOURCE, ART_NO_SOURCE],
  );

  // A canonical source exists ONLY for ART_RESOLVABLE (metadata.artifactId link).
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO cre_evidence_sources
       (organization_id, visibility_class, source_type, title, checksum,
        ingestion_status, extraction_status, metadata)
     VALUES ($1, 'tenant_private', 'client_document', 'upload.pdf', 'sum-1',
             'ingested', 'extracted', $2::jsonb)
     RETURNING id`,
    [ORG, JSON.stringify({ artifactId: ART_RESOLVABLE })],
  );
  evidenceSourceId = rows[0].id;
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

// projectArtifacts carry the org (all share one via loadProjectArtifacts); enrich
// derives orgId from projectArtifacts[0].organization_id.
const projectArtifacts = [
  { id: 1, artifact_id: 'some-artifact', project_id: 1, organization_id: ORG } as ArtifactRow,
];

describe('enrichChunksWithArtifactMetadata — evidenceSourceId stamping', () => {
  it('stamps evidenceSourceId for an atom whose upload created a canonical source', async () => {
    const chunks = await enrichChunksWithArtifactMetadata(
      [{ id: ATOM_RESOLVABLE, title: 'T', content: 'verbatim text', score: 0.9 }],
      projectArtifacts,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].evidenceSourceId).toBe(evidenceSourceId);
  });

  it('leaves evidenceSourceId undefined for an atom with no canonical source (honest)', async () => {
    const chunks = await enrichChunksWithArtifactMetadata(
      [{ id: ATOM_NO_SOURCE, title: 'T', content: 'x', score: 0.5 }],
      projectArtifacts,
    );
    expect(chunks[0].evidenceSourceId).toBeUndefined();
  });

  it('is tenant-scoped: another org does not resolve this org\'s source', async () => {
    const otherOrgArtifacts = [
      { id: 2, artifact_id: 'a', project_id: 2, organization_id: 9999 } as ArtifactRow,
    ];
    const chunks = await enrichChunksWithArtifactMetadata(
      [{ id: ATOM_RESOLVABLE, title: 'T', content: 'verbatim text', score: 0.9 }],
      otherOrgArtifacts,
    );
    expect(chunks[0].evidenceSourceId).toBeUndefined();
  });

  it('mixed batch resolves only the atoms that have a canonical source', async () => {
    const chunks = await enrichChunksWithArtifactMetadata(
      [
        { id: ATOM_RESOLVABLE, title: 'T', content: 'a', score: 0.9 },
        { id: ATOM_NO_SOURCE, title: 'T', content: 'b', score: 0.8 },
      ],
      projectArtifacts,
    );
    const byId = new Map(chunks.map(c => [c.id, c.evidenceSourceId]));
    expect(byId.get(ATOM_RESOLVABLE)).toBe(evidenceSourceId);
    expect(byId.get(ATOM_NO_SOURCE)).toBeUndefined();
  });
});
