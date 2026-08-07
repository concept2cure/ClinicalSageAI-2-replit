/**
 * Artifact provenance uniformity — artifactVersionStore, END-TO-END on PGlite.
 *
 * Proves the AnA Document Studio writer emits a concept2cure_provenance_events
 * row for every artifact write, in the same transaction:
 *   - first draft  → a 'generation' event
 *   - new version  → an 'edit' event
 *   - identical re-emit (dedupe) → no new event
 *
 * This is the first application of the canonical recordArtifactProvenance
 * primitive as we make provenance uniform across every artifact producer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => {
  const holder: { pg: any } = { pg: null };
  const wrap = async (sql: string, params?: unknown[]) => {
    const r = await holder.pg.query(sql, params as unknown[]);
    return {
      rows: r.rows as any[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  };
  const pool = {
    query: (s: string, p?: unknown[]) => wrap(s, p),
    connect: async () => ({ query: (s: string, p?: unknown[]) => wrap(s, p), release: () => undefined }),
  };
  return { holder, wrap, pool };
});
vi.mock('../../../db', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));

import { upsertDocumentArtifactVersion } from '../artifactVersionStore';

const wrap = h.wrap;
const ORG = 7;
const USER = 4242;

async function eventCount(eventType?: string): Promise<number> {
  const sql = eventType
    ? `SELECT COUNT(*)::int AS n FROM concept2cure_provenance_events WHERE organization_id = $1 AND event_type = $2`
    : `SELECT COUNT(*)::int AS n FROM concept2cure_provenance_events WHERE organization_id = $1`;
  const r = await wrap(sql, eventType ? [ORG, eventType] : [ORG]);
  return Number((r.rows[0] as any).n);
}

beforeAll(async () => {
  const pglite = new PGlite();
  h.holder.pg = pglite;
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, name text);
    CREATE TABLE concept2cure_artifacts (
      id serial PRIMARY KEY, artifact_id text, project_id int, organization_id int,
      type text, category text, title text, content text, content_hash text, version int,
      ana_thread_id text, title_slug text, status text, created_by_id int, metadata jsonb,
      created_at timestamptz, updated_at timestamptz);
    CREATE TABLE concept2cure_artifact_versions (
      id serial PRIMARY KEY, artifact_id int, organization_id int, version int, content text,
      content_hash text, change_description text, created_by_id int,
      created_at timestamptz, updated_at timestamptz);
    CREATE TABLE concept2cure_provenance_events (
      id serial PRIMARY KEY, event_id text NOT NULL UNIQUE, artifact_id int NOT NULL,
      artifact_version_id int, organization_id int NOT NULL, event_type text NOT NULL,
      event_action text NOT NULL, actor_id int, actor_name text, actor_email text,
      details jsonb NOT NULL DEFAULT '{}', source_artifact_id int, source_description text,
      backend_route text, backend_service text, ip_address varchar(45),
      created_at timestamptz NOT NULL DEFAULT now());
  `);
  await pglite.query(`INSERT INTO organizations (id, name) VALUES ($1,'a')`, [ORG]);
}, 90_000);

afterAll(async () => {
  await h.holder.pg?.close();
});

beforeEach(async () => {
  await h.holder.pg.exec(
    `DELETE FROM concept2cure_provenance_events; DELETE FROM concept2cure_artifact_versions; DELETE FROM concept2cure_artifacts;`,
  );
});

describe('artifactVersionStore provenance uniformity', () => {
  it('first draft emits a generation provenance event', async () => {
    const res = await upsertDocumentArtifactVersion({
      organizationId: ORG, projectId: 1, userId: USER, anaThreadId: 't1',
      title: 'IND Cover Letter', content: 'Dear FDA, please find enclosed our IND.',
    });
    expect(res.created).toBe(true);
    expect(await eventCount('generation')).toBe(1);
    expect(await eventCount()).toBe(1);
  });

  it('a new version emits an edit provenance event (not another generation)', async () => {
    await upsertDocumentArtifactVersion({
      organizationId: ORG, projectId: 1, userId: USER, anaThreadId: 't2',
      title: 'Protocol Synopsis', content: 'v1 synopsis text.',
    });
    await upsertDocumentArtifactVersion({
      organizationId: ORG, projectId: 1, userId: USER, anaThreadId: 't2',
      title: 'Protocol Synopsis', content: 'v2 synopsis text, revised.',
    });
    expect(await eventCount('generation')).toBe(1);
    expect(await eventCount('edit')).toBe(1);
    expect(await eventCount()).toBe(2);
  });

  it('an identical re-emit (dedupe) records NO new provenance event', async () => {
    const same = 'identical content that should not manufacture a version';
    await upsertDocumentArtifactVersion({
      organizationId: ORG, projectId: 1, userId: USER, anaThreadId: 't3', title: 'SAP', content: same,
    });
    const before = await eventCount();
    const res = await upsertDocumentArtifactVersion({
      organizationId: ORG, projectId: 1, userId: USER, anaThreadId: 't3', title: 'SAP', content: same,
    });
    expect(res.created).toBe(false);
    expect(await eventCount()).toBe(before);
  });
});
