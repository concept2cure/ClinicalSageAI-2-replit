/**
 * recordArtifactProvenanceBestEffort — proves it does NOT poison the caller's
 * transaction, against real Postgres semantics via in-process PGlite.
 *
 * The bug this guards against: a provenance INSERT that fails inside a
 * transaction aborts the WHOLE transaction, so a plain try/catch around it only
 * hides the error while every later statement on that connection fails too. The
 * SAVEPOINT wrapper must contain the failure so the caller's transaction — the
 * erasure, the rewrite, the import that provenance was meant to annotate —
 * survives and commits.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  recordArtifactProvenance,
  recordArtifactProvenanceBestEffort,
} from '../artifact-provenance';

let pglite: PGlite;
const exec = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as any[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};

const ORG = 1;
let realArtifactId: number;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE users (id SERIAL PRIMARY KEY);
    CREATE TABLE concept2cure_artifacts (id SERIAL PRIMARY KEY);
    CREATE TABLE concept2cure_artifact_versions (id SERIAL PRIMARY KEY);
    CREATE TABLE concept2cure_provenance_events (
      id SERIAL PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
      artifact_version_id INTEGER REFERENCES concept2cure_artifact_versions(id),
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      event_type TEXT NOT NULL,
      event_action TEXT NOT NULL,
      actor_id INTEGER REFERENCES users(id),
      actor_name TEXT,
      actor_email TEXT,
      details JSONB NOT NULL DEFAULT '{}',
      source_artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
      source_description TEXT,
      backend_route TEXT,
      backend_service TEXT,
      ip_address VARCHAR(45),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE scratch (v INTEGER);
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'a');
    INSERT INTO concept2cure_artifacts DEFAULT VALUES;
  `);
  const { rows } = await exec.query('SELECT id FROM concept2cure_artifacts LIMIT 1');
  realArtifactId = (rows[0] as { id: number }).id;
});

afterAll(async () => {
  await pglite?.close();
});

const goodInput = (artifactId: number) => ({
  artifactId,
  organizationId: ORG,
  eventType: 'generation' as const,
  eventAction: 'test',
});

describe('recordArtifactProvenanceBestEffort — inside a transaction', () => {
  it('records the event and lets the transaction commit', async () => {
    await exec.query('BEGIN');
    const id = await recordArtifactProvenanceBestEffort(exec, goodInput(realArtifactId));
    expect(id).toMatch(/^prov_/);
    await exec.query('COMMIT');

    const { rows } = await exec.query('SELECT event_id FROM concept2cure_provenance_events WHERE event_id = $1', [id]);
    expect(rows).toHaveLength(1);
  });

  it('a FAILED provenance write does not poison the transaction', async () => {
    await exec.query('BEGIN');
    await exec.query('INSERT INTO scratch (v) VALUES (10)');

    // artifact_id 999999 does not exist → FK violation → the write must roll back
    // to its savepoint and return null WITHOUT aborting the outer transaction.
    const id = await recordArtifactProvenanceBestEffort(exec, goodInput(999999));
    expect(id).toBeNull();

    // The transaction is still usable: this statement must succeed and commit.
    await exec.query('INSERT INTO scratch (v) VALUES (20)');
    await exec.query('COMMIT');

    const { rows } = await exec.query('SELECT v FROM scratch ORDER BY v');
    expect(rows.map((r: any) => r.v)).toEqual([10, 20]);
  });

  it('the failed write left no provenance row behind', async () => {
    const { rows } = await exec.query(
      `SELECT COUNT(*)::int AS n FROM concept2cure_provenance_events WHERE artifact_id = 999999`,
    );
    expect((rows[0] as { n: number }).n).toBe(0);
  });
});

describe('recordArtifactProvenanceBestEffort — outside a transaction', () => {
  it('records the event (autocommit) and returns its id', async () => {
    const id = await recordArtifactProvenanceBestEffort(exec, goodInput(realArtifactId));
    expect(id).toMatch(/^prov_/);
    const { rows } = await exec.query('SELECT event_id FROM concept2cure_provenance_events WHERE event_id = $1', [id]);
    expect(rows).toHaveLength(1);
  });

  it('returns null (never throws) when the write fails', async () => {
    const id = await recordArtifactProvenanceBestEffort(exec, goodInput(999999));
    expect(id).toBeNull();
  });
});

describe('recordArtifactProvenance (fail-closed) — the contract best-effort wraps', () => {
  it('throws on a failed write, so an in-tx caller fails closed', async () => {
    await expect(recordArtifactProvenance(exec, goodInput(999999))).rejects.toThrow();
  });
});
