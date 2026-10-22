/**
 * artifactWriteback span lineage — END-TO-END on PGlite (ledger L177).
 *
 * `registerArtifactWithGovernance` is the shared writer behind compute output,
 * an accepted conversation-OS proposal and a generated draft — four callers,
 * every one of them creating a `type='regulatory_document'` artifact. It
 * recorded provenance and a §11.10(e) audit row from the start and recorded NO
 * span lineage at all, so a governed document could arrive with a full audit
 * trail and no record of where a single sentence came from.
 *
 * It was invisible to `ci:lineage-save-gate` because that gate's discovery
 * matched only EDITS (`UPDATE … SET content =`), and this path CREATES. The
 * INSERT rule added in the same ledger row is what surfaced it.
 *
 * These tests hold the repair in place:
 *   - the text is attributed to the acting user, in the same transaction
 *   - the attribution actually covers the content (not a token span)
 *   - a lineage failure rolls the ARTIFACT back too — fail-closed, so there is
 *     no state where the document exists and its lineage does not
 *   - empty content attributes nothing rather than inventing a span
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
    connect: async () => ({
      query: (s: string, p?: unknown[]) => wrap(s, p),
      release: () => undefined,
    }),
  };
  return { holder, wrap, pool };
});
vi.mock('../../../db', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));

import { registerArtifactWithGovernance } from '../artifactWriteback';

const wrap = h.wrap;
const ORG = 7;
const USER = 4242;

const CONTENT =
  'The primary endpoint was met at week 24. No treatment-related serious adverse events were reported.';

async function spans(): Promise<any[]> {
  const r = await wrap(
    `SELECT provenance_kind, char_start, char_end, asserted_by, document_table
       FROM document_span_lineage
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY char_start`,
    [ORG],
  );
  return r.rows;
}

beforeAll(async () => {
  const pglite = new PGlite();
  h.holder.pg = pglite;
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, name text, status text NOT NULL DEFAULT 'active');
    CREATE TABLE users (id serial PRIMARY KEY, name text, email text, title text, status text NOT NULL DEFAULT 'active');
    CREATE TABLE organization_users (
      id serial PRIMARY KEY, organization_id int NOT NULL, user_id int NOT NULL, role text);
    CREATE TABLE concept2cure_artifacts (
      id serial PRIMARY KEY, artifact_id text, project_id int, organization_id int,
      type text, category text, title text, content text, content_hash text, version int,
      ctd_section text, status text, created_by_id int, metadata jsonb,
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
    CREATE TABLE regulatory_audit_logs (
      id serial PRIMARY KEY, audit_id text, organization_id int, entity_type text,
      entity_id text, action text, action_category text, previous_value jsonb,
      new_value jsonb, user_id int, user_name text, user_role text, ip_address varchar(45),
      is_gxp_relevant boolean, timestamp timestamptz, metadata jsonb);
  `);
  await pglite.query(`INSERT INTO organizations (id, name) VALUES ($1,'a')`, [ORG]);
  // The acting users are members, so the writer can name them.
  await pglite.query(
    `INSERT INTO users (id, name, email) VALUES ($1,'Dana Reyes','dana@example.org'), (99,'Sam Ito','sam@example.org'), (500,'Outsider','out@example.org')`,
    [USER],
  );
  await pglite.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1,$2,'regulatory_lead'), ($1,99,'author')`,
    [ORG, USER],
  );

  // The lineage gate this writer now enlists (ledger L177): the evidence spine
  // and the span-lineage store, from the real migrations rather than a stand-in,
  // so the test exercises the schema the gate actually writes to.
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of [
    'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
    'db/migrations/20260803_document_span_lineage.sql',
    'migrations/20260907_span_lineage_accepted_machine_draft.sql',
    'migrations/20260908_span_lineage_machine_draft.sql',
  ]) {
    await pglite.exec(readFileSync(resolve(here, '../../../../', rel), 'utf8'));
  }
}, 90_000);

afterAll(async () => {
  await h.holder.pg?.close();
});

beforeEach(async () => {
  await h.holder.pg.exec(
    `DELETE FROM document_span_lineage;
     DELETE FROM regulatory_audit_logs;
     DELETE FROM concept2cure_provenance_events;
     DELETE FROM concept2cure_artifact_versions;
     DELETE FROM concept2cure_artifacts;`,
  );
});

function input(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    projectId: 1,
    userId: USER,
    title: 'Interim Efficacy Summary',
    content: CONTENT,
    sourceJobId: 'job_1',
    surfaceKey: 'compute_finalize',
    sourceType: 'compute',
    backendRoute: 'POST /api/concept2cure/compute/projects/:projectId/jobs',
    ...overrides,
  } as any;
}

describe('artifactWriteback records span lineage with the document it creates', () => {
  it('attributes the text to the acting user, in the write transaction', async () => {
    const res = await registerArtifactWithGovernance(input());
    expect(res.artifactId).toBeTruthy();

    const rows = await spans();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const s of rows) {
      expect(s.provenance_kind).toBe('author_assertion');
      expect(String(s.asserted_by)).toBe(String(USER));
      expect(s.document_table).toBe('concept2cure_artifacts');
    }

    // The attribution covers the content rather than tokenising a corner of it:
    // the recorded spans reach the end of the text.
    const maxEnd = Math.max(...rows.map((s) => Number(s.char_end)));
    expect(maxEnd).toBe(CONTENT.length);
  });

  it('attributes a proposal_accept writeback the same way — the caller does not change who asserted it', async () => {
    await registerArtifactWithGovernance(
      input({ surfaceKey: 'conversation_os_proposal_accept', sourceType: 'proposal_accept', sourceJobId: undefined, userId: 99 }),
    );
    const rows = await spans();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((s) => String(s.asserted_by) === '99')).toBe(true);
  });

  it('FAILS CLOSED — a broken lineage write rolls the artifact and its version back', async () => {
    // Break only the lineage store. If the artifact survived this, a governed
    // document would exist whose provenance was silently dropped, which is the
    // exact state the gate exists to make impossible.
    await h.holder.pg.exec(`ALTER TABLE document_span_lineage RENAME TO document_span_lineage_hidden;`);
    try {
      await expect(registerArtifactWithGovernance(input())).rejects.toThrow();

      const arts = await wrap(`SELECT COUNT(*)::int AS n FROM concept2cure_artifacts`);
      const vers = await wrap(`SELECT COUNT(*)::int AS n FROM concept2cure_artifact_versions`);
      expect(Number(arts.rows[0].n)).toBe(0);
      expect(Number(vers.rows[0].n)).toBe(0);
    } finally {
      await h.holder.pg.exec(
        `ALTER TABLE document_span_lineage_hidden RENAME TO document_span_lineage;`,
      );
    }
  });

  it('records nothing rather than inventing a span when there is no content', async () => {
    const res = await registerArtifactWithGovernance(input({ content: '' }));
    expect(res.artifactId).toBeTruthy();
    expect(await spans()).toHaveLength(0);
  });
});

describe('artifactWriteback records who acted, as the record says', () => {
  /* The writer invented its attribution: ip_address '127.0.0.1' on the
     provenance event and the GxP audit row, user_role 'system', actor_name
     'Artifact Compute Plane' / 'Export Governance Plane' with a user_name slug
     of it beside the real user id, and "generated by compute job …" plus a
     finalize route that does not exist, whatever the caller. */
  async function rows() {
    const a = await wrap(`SELECT user_id, user_name, user_role, ip_address FROM regulatory_audit_logs`);
    const p = await wrap(`SELECT actor_id, actor_name, actor_email, ip_address, backend_route, backend_service FROM concept2cure_provenance_events`);
    const v = await wrap(`SELECT change_description FROM concept2cure_artifact_versions`);
    return { audit: a.rows[0], prov: p.rows[0], version: v.rows[0] };
  }

  it("names the member who acted, with their organization role, and says when no address was captured", async () => {
    await registerArtifactWithGovernance(input());
    const { audit, prov, version } = await rows();
    expect(audit).toMatchObject({ user_id: USER, user_name: 'Dana Reyes', user_role: 'regulatory_lead', ip_address: 'ip-not-captured' });
    expect(prov).toMatchObject({
      actor_id: USER, actor_name: 'Dana Reyes', actor_email: 'dana@example.org', ip_address: null,
      backend_route: 'POST /api/concept2cure/compute/projects/:projectId/jobs', backend_service: 'artifact-compute',
    });
    expect(version.change_description).toBe('Initial version from compute job job_1');
  });

  it("records the request's address when the caller has it", async () => {
    await registerArtifactWithGovernance(input({ ipAddress: '203.0.113.7' }));
    const { audit, prov } = await rows();
    expect(audit.ip_address).toBe('203.0.113.7');
    expect(prov.ip_address).toBe('203.0.113.7');
  });

  it('describes an export and an accepted proposal as what they are', async () => {
    await registerArtifactWithGovernance(input({
      sourceType: 'export', surfaceKey: 'export_zip', sourceJobId: undefined,
      backendRoute: 'POST /api/submissions/programs/:programId/technical-file/export', userId: 99,
    }));
    const { audit, prov, version } = await rows();
    expect(audit).toMatchObject({ user_name: 'Sam Ito', user_role: 'author' });
    expect(prov.backend_service).toBe('export-governance');
    expect(version.change_description).toBe('Initial version recorded for a governed export_zip export');
  });

  it('refuses a user who is not a member, and writes nothing', async () => {
    await expect(registerArtifactWithGovernance(input({ userId: 500 }))).rejects.toThrow(/not a member/);
    const arts = await wrap(`SELECT COUNT(*)::int AS n FROM concept2cure_artifacts`);
    const audits = await wrap(`SELECT COUNT(*)::int AS n FROM regulatory_audit_logs`);
    expect(Number(arts.rows[0].n)).toBe(0);
    expect(Number(audits.rows[0].n)).toBe(0);
  });

  it('refuses a writeback that does not name its route', async () => {
    await expect(registerArtifactWithGovernance(input({ backendRoute: '' }))).rejects.toThrow(/backendRoute is required/);
  });
});
