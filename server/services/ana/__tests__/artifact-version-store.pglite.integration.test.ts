/**
 * artifactVersionStore — END-TO-END against a real (in-process PGlite) Postgres.
 *
 * The document-spine unit tests exercise the orchestration with MOCKED deps.
 * This proves the one remaining piece that mocks can't: that
 * upsertDocumentArtifactVersionTx's actual SQL — the FOR UPDATE lock on the head
 * row, max(version)+1 append into concept2cure_artifact_versions, the SHA-256
 * content-hash de-dupe, and the head-row bump — executes correctly against a
 * real Postgres engine (the canonical concept2cure_artifacts identity).
 *
 * PGlite is pure-WASM Postgres — no server, no docker, no cloud.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { upsertDocumentArtifactVersionTx } from '../artifactVersionStore.js';

// Minimal DDL mirroring the columns the store writes/reads on the canonical
// artifacts identity (full DDL lives in the core schema / migration 20260311).
const DDL = `
CREATE TABLE IF NOT EXISTS concept2cure_artifacts (
  id              SERIAL PRIMARY KEY,
  artifact_id     TEXT NOT NULL,
  project_id      INTEGER,
  organization_id INTEGER NOT NULL,
  type            TEXT NOT NULL,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  content_hash    TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  ana_thread_id   TEXT,
  title_slug      TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  created_by_id   INTEGER,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS concept2cure_artifact_versions (
  id                 SERIAL PRIMARY KEY,
  artifact_id        INTEGER NOT NULL,
  organization_id    INTEGER NOT NULL,
  version            INTEGER NOT NULL,
  content            TEXT NOT NULL,
  content_hash       TEXT NOT NULL,
  change_description TEXT,
  created_by_id      INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT c2c_artifact_unique_version UNIQUE (artifact_id, version)
);
CREATE TABLE IF NOT EXISTS concept2cure_provenance_events (
  id                  SERIAL PRIMARY KEY,
  event_id            TEXT NOT NULL UNIQUE,
  artifact_id         INTEGER NOT NULL,
  artifact_version_id INTEGER,
  organization_id     INTEGER NOT NULL,
  event_type          TEXT NOT NULL,
  event_action        TEXT NOT NULL,
  actor_id            INTEGER,
  actor_name          TEXT,
  actor_email         TEXT,
  details             JSONB NOT NULL DEFAULT '{}',
  source_artifact_id  INTEGER,
  source_description  TEXT,
  backend_route       TEXT,
  backend_service     TEXT,
  ip_address          VARCHAR(45),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let pg: PGlite;
// The store's Tx variant needs a client with a node-pg-compatible .query(sql, params).
let client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

const base = {
  organizationId: 1,
  projectId: 10,
  userId: 5,
  anaThreadId: 'thread-abc',
  title: 'Clinical Overview',
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  // The lineage gate the artifact writer now enlists (ledger L160): a real
  // organizations row for the FK, the evidence spine and the span-lineage store.
  await pg.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pg.exec(`INSERT INTO organizations (id, name) VALUES (1, 'org-1') ON CONFLICT DO NOTHING;`);
  for (const rel of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql', 'db/migrations/20260803_document_span_lineage.sql']) {
    await pg.exec(fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8'));
  }
  client = { query: (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: any[] }> };
});
afterAll(async () => {
  await pg.close();
});

describe('upsertDocumentArtifactVersionTx against real Postgres', () => {
  it('creates a new artifact at version 1 on first write', async () => {
    const r = await upsertDocumentArtifactVersionTx(client as any, { ...base, content: 'first draft' });
    expect(r.created).toBe(true);
    expect(r.version).toBe(1);
    expect(r.artifactId).toMatch(/^artifact_/);
    expect(r.artifactPk).toBeGreaterThan(0);

    const rows = await pg.query(`SELECT count(*)::int AS n FROM concept2cure_artifact_versions WHERE artifact_id = $1`, [r.artifactPk]);
    expect((rows.rows[0] as { n: number }).n).toBe(1);
  });

  it('appends version 2 (max(version)+1) when content changes on the same thread', async () => {
    const r = await upsertDocumentArtifactVersionTx(client as any, { ...base, content: 'second draft' });
    expect(r.created).toBe(true);
    expect(r.version).toBe(2);

    const head = await pg.query(`SELECT version, content FROM concept2cure_artifacts WHERE id = $1`, [r.artifactPk]);
    expect((head.rows[0] as { version: number }).version).toBe(2);
    expect((head.rows[0] as { content: string }).content).toBe('second draft');
  });

  it('de-dupes an identical re-emit of the latest content (no phantom version)', async () => {
    const r = await upsertDocumentArtifactVersionTx(client as any, { ...base, content: 'second draft' });
    expect(r.created).toBe(false);
    expect(r.version).toBe(2); // unchanged

    const versions = await pg.query(`SELECT count(*)::int AS n FROM concept2cure_artifact_versions v JOIN concept2cure_artifacts a ON a.id = v.artifact_id WHERE a.ana_thread_id = $1`, ['thread-abc']);
    expect((versions.rows[0] as { n: number }).n).toBe(2); // still 2, no dupe
  });

  it('records the operator reason-for-change on the version row', async () => {
    const r = await upsertDocumentArtifactVersionTx(client as any, {
      ...base,
      content: 'third draft',
      reasonForChange: 'Incorporated FDA feedback on 2.5.4',
    });
    expect(r.version).toBe(3);
    const v = await pg.query(`SELECT change_description FROM concept2cure_artifact_versions WHERE artifact_id = $1 AND version = 3`, [r.artifactPk]);
    expect((v.rows[0] as { change_description: string }).change_description).toBe('Incorporated FDA feedback on 2.5.4');
  });

  it('isolates a different thread as its own artifact lineage', async () => {
    const r = await upsertDocumentArtifactVersionTx(client as any, { ...base, anaThreadId: 'thread-xyz', content: 'other doc' });
    expect(r.created).toBe(true);
    expect(r.version).toBe(1); // independent lineage
  });

  it('treats title case/whitespace as the same document (title_slug normalization)', async () => {
    const r = await upsertDocumentArtifactVersionTx(client as any, {
      ...base,
      title: '  clinical overview ', // same slug as 'Clinical Overview'
      content: 'fourth draft',
    });
    expect(r.created).toBe(true);
    expect(r.version).toBe(4); // appended to the original lineage, not a new one
  });
});
