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
  // The lineage gate the store now enlists (ledger L160): the evidence spine
  // and the span-lineage store, from the real migrations.
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql', 'db/migrations/20260803_document_span_lineage.sql']) {
    await pglite.exec(readFileSync(resolve(here, '../../../../', rel), 'utf8'));
  }
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

// ── Ledger L160: every version carries span lineage, in the same transaction ──
async function spanRows(artifactPk: number) {
  const r = await wrap(
    `SELECT provenance_kind, reference_id FROM document_span_lineage
      WHERE document_table = 'concept2cure_artifacts' AND document_id = $1 AND deleted_at IS NULL`,
    [String(artifactPk)],
  );
  return r.rows as Array<{ provenance_kind: string; reference_id: string | null }>;
}
const QUOTED = 'The primary endpoint was met at week twelve in the intent-to-treat population.';
const ORIGINAL = 'These findings were consistent across every prespecified subgroup we examined.';

describe('artifactVersionStore lineage (ledger L160)', () => {
  it('the first draft records every clause as the author\'s assertion', async () => {
    const r = await upsertDocumentArtifactVersion({
      organizationId: ORG, projectId: 1, userId: USER, anaThreadId: 't-l160-1', title: 'Clinical Overview',
      content: `${QUOTED} ${ORIGINAL}`,
    });
    expect(r.created).toBe(true);
    expect(r.lineage?.authorSpans).toBeGreaterThanOrEqual(2);
    const rows = await spanRows(r.artifactPk);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((x) => x.provenance_kind === 'author_assertion')).toBe(true);
  });

  it('a new version re-records lineage for the new text; a de-dupe re-emit records nothing new', async () => {
    const first = await upsertDocumentArtifactVersion({
      organizationId: ORG, projectId: 1, userId: USER, anaThreadId: 't-l160-2', title: 'Clinical Overview', content: `${QUOTED}`,
    });
    const second = await upsertDocumentArtifactVersion({
      organizationId: ORG, projectId: 1, userId: USER, anaThreadId: 't-l160-2', title: 'Clinical Overview', content: `${QUOTED} ${ORIGINAL}`,
    });
    expect(second.version).toBe(first.version + 1);
    expect(second.lineage?.authorSpans).toBeGreaterThanOrEqual(2);
    const again = await upsertDocumentArtifactVersion({
      organizationId: ORG, projectId: 1, userId: USER, anaThreadId: 't-l160-2', title: 'Clinical Overview', content: `${QUOTED} ${ORIGINAL}`,
    });
    expect(again.created).toBe(false);
    expect(again.lineage).toBeNull();
  });

  it('with sources, the verbatim clause lands on the cited Data Room source', async () => {
    const src = await wrap(
      `INSERT INTO cre_evidence_sources (organization_id, visibility_class, source_type, title, checksum, ingestion_status, extraction_status)
       VALUES ($1, 'tenant_private', 'client_document', 'csr.pdf', 'sha-l160', 'ingested', 'extracted') RETURNING id`,
      [ORG],
    );
    const sourceId = (src.rows[0] as { id: number }).id;
    const r = await upsertDocumentArtifactVersion({
      organizationId: ORG, projectId: 1, userId: USER, anaThreadId: 't-l160-3', title: 'Clinical Overview',
      content: `${QUOTED} ${ORIGINAL}`,
      sources: [{ sourceId, content: `Clinical study report. ${QUOTED} More.` }],
    });
    expect(r.lineage?.sourceSpans).toBe(1);
    const rows = await spanRows(r.artifactPk);
    expect(rows.some((x) => x.provenance_kind === 'cre_evidence_source' && x.reference_id === String(sourceId))).toBe(true);
  });

  it('refuses a version with no identified author, and writes no artifact', async () => {
    await expect(
      upsertDocumentArtifactVersion({
        organizationId: ORG, projectId: 1, userId: null, anaThreadId: 't-l160-4', title: 'Unattributed', content: `${QUOTED}`,
      }),
    ).rejects.toThrow(/identified author/);
    const r = await wrap(`SELECT count(*)::int AS n FROM concept2cure_artifacts WHERE ana_thread_id = 't-l160-4'`);
    expect(Number((r.rows[0] as { n: number }).n)).toBe(0);
  });
});
