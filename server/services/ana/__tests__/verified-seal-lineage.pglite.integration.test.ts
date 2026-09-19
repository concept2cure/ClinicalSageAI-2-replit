/**
 * verifiedSealService span lineage — END-TO-END on PGlite (ledger L177).
 *
 * A §11.50 manifestation is a named person putting their signature to a
 * document. `sealVerifiedVersion` recorded the signature, the sealed record,
 * a provenance event and a §11.10(e) audit row — and no span lineage at all,
 * so a sealed, signed regulatory document could carry a full signature
 * manifest over sentences with no recorded origin.
 *
 * The sibling unit test (verified-seal-service.test.ts) injects a fake pool and
 * can only assert the SHAPE of the transaction; its lineage answers are an
 * admitted stub. This file is where the lineage claims are actually checked,
 * against the real migrations:
 *
 *   - the sealed text is attributed to the signer, in the seal transaction
 *   - an artifact that already carries SOURCE spans keeps them — sealing must
 *     not flatten real citations into a blanket author claim
 *   - a lineage failure rolls the SEAL back: no signature over unattributed text
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

import { sealVerifiedVersion, type SealVerifiedVersionInput } from '../verifiedSealService';
import { replaceSourceSpans } from '../../clinical-regulatory-evidence/span-lineage.service';

const wrap = h.wrap;
const ORG = 11;
const USER = 4242;

/** Two clauses, so a source span can cover one and the author the other. */
const QUOTED = 'The drug product is stable for 24 months at 25°C.';
const CONTENT = `${QUOTED} Stability supports the proposed shelf life.`;

async function spans(): Promise<any[]> {
  const r = await wrap(
    `SELECT provenance_kind, char_start, char_end, asserted_by, reference_id
       FROM document_span_lineage
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY char_start`,
    [ORG],
  );
  return r.rows;
}

async function count(table: string): Promise<number> {
  const r = await wrap(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return Number(r.rows[0].n);
}

beforeAll(async () => {
  const pglite = new PGlite();
  h.holder.pg = pglite;
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, name text);
    -- resolve-signer-identity reads u.name / u.email / u.title by those names.
    CREATE TABLE users (id serial PRIMARY KEY, name text, email text, title text);
    CREATE TABLE organization_users (
      id serial PRIMARY KEY, organization_id int, user_id int, role text, title text);
    CREATE TABLE concept2cure_artifacts (
      id serial PRIMARY KEY, artifact_id text, project_id int, organization_id int,
      type text, category text, title text, content text, content_hash text, version int,
      ctd_section text, status text, created_by_id int, metadata jsonb,
      created_at timestamptz, updated_at timestamptz);
    CREATE TABLE concept2cure_artifact_versions (
      id serial PRIMARY KEY, artifact_id int, organization_id int, version int, content text,
      content_hash text, change_description text, created_by_id int,
      created_at timestamptz, updated_at timestamptz);
    CREATE TABLE concept2cure_signatures (
      id serial PRIMARY KEY, signature_id text, artifact_id int, artifact_version_id int,
      organization_id int, signature_type text, signature_purpose text, signature_meaning text,
      signer_id int, signer_name text, signer_email text, signer_role text,
      authentication_method text, authentication_timestamp timestamptz,
      second_factor_verified boolean, signature_hash text, signature_manifest jsonb,
      ip_address varchar(45), status text, signed_at timestamptz);
    CREATE TABLE concept2cure_provenance_events (
      id serial PRIMARY KEY, event_id text NOT NULL UNIQUE, artifact_id int NOT NULL,
      artifact_version_id int, organization_id int NOT NULL, event_type text NOT NULL,
      event_action text NOT NULL, actor_id int, actor_name text, actor_email text,
      details jsonb NOT NULL DEFAULT '{}', source_artifact_id int, source_description text,
      backend_route text, backend_service text, ip_address varchar(45),
      created_at timestamptz NOT NULL DEFAULT now());
    -- Built to the CANONICAL shapes (migrations/0000_sweet_joseph.sql), not to
    -- what the code happened to name: concept2cure_signatures has signed_at and
    -- NO created_at/updated_at, and regulatory_audit_logs has only a timestamp column.
    -- Both INSERTs named columns that do not exist, which Postgres rejects at
    -- PLAN time — so this fixture is what caught it.
    CREATE TABLE regulatory_audit_logs (
      id serial PRIMARY KEY, audit_id text, organization_id int, entity_type text,
      entity_id text, action text, action_category text, previous_value jsonb,
      new_value jsonb, user_id int, user_name text, user_role text, ip_address varchar(45),
      is_gxp_relevant boolean, timestamp timestamptz, metadata jsonb);
  `);
  await pglite.query(`INSERT INTO organizations (id, name) VALUES ($1,'a')`, [ORG]);
  // §11.100: the printed name is resolved from the membership record, so the
  // signer has to actually be a member or the seal refuses before writing.
  await pglite.query(
    `INSERT INTO users (id, name, email, title) VALUES ($1,'Dr. Jane Roe','jane@example.com','RA Lead')`,
    [USER],
  );
  await pglite.query(
    `INSERT INTO organization_users (organization_id, user_id, role, title) VALUES ($1,$2,'admin','RA Lead')`,
    [ORG, USER],
  );

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
     DELETE FROM concept2cure_signatures;
     DELETE FROM concept2cure_artifact_versions;
     DELETE FROM concept2cure_artifacts;`,
  );
});

function baseInput(over: Partial<SealVerifiedVersionInput> = {}): SealVerifiedVersionInput {
  return {
    organizationId: ORG,
    projectId: 7,
    userId: USER,
    signerName: 'Dr. Jane Roe',
    signerEmail: 'jane@example.com',
    signerRole: 'ra_lead',
    title: 'Module 3.2.P.8 Stability',
    content: CONTENT,
    manifestation: {
      printedName: 'Dr. Jane Roe',
      meaning: 'APPROVER',
      reasonForChange: 'Verified clean against source.',
    },
    verification: { ok: true, message: 'Verified.' },
    ...over,
  };
}

describe('sealVerifiedVersion attributes the text it seals', () => {
  it('records author lineage for the sealed content, in the seal transaction', async () => {
    const res = await sealVerifiedVersion(baseInput());
    expect(res.signatureId).toMatch(/^sig_/);

    const rows = await spans();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((s) => s.provenance_kind === 'author_assertion')).toBe(true);
    expect(rows.every((s) => String(s.asserted_by) === String(USER))).toBe(true);
    // The attribution reaches the end of what was signed.
    expect(Math.max(...rows.map((s) => Number(s.char_end)))).toBe(CONTENT.length);

    // And it is one transaction with the signature.
    expect(await count('concept2cure_signatures')).toBe(1);
  });

  it('KEEPS existing source spans — sealing must not flatten citations into an author claim', async () => {
    // A persisted artifact that was drafted from a cited source, as the Build-1
    // path produces it.
    const art = await wrap(
      `INSERT INTO concept2cure_artifacts
         (artifact_id, project_id, organization_id, type, category, title, content, version, status, created_by_id)
       VALUES ('artifact_persisted', 7, $1, 'regulatory_document', 'document', 't', $2, 1, 'draft', $3)
       RETURNING id`,
      [ORG, CONTENT, USER],
    );
    const artifactPk = Number(art.rows[0].id);

    const src = await wrap(
      // A checksum is required, not decorative: recordSourceSpan copies it into
      // payload_sha256, and the kind_shape CHECK refuses a cre_evidence_source
      // span that carries no reference AND checksum.
      `INSERT INTO cre_evidence_sources (organization_id, title, source_type, checksum, metadata)
       VALUES ($1, 'Stability Report', 'document', $2, '{}'::jsonb) RETURNING id`,
      [ORG, 'c'.repeat(64)],
    );
    const sourceId = Number(src.rows[0].id);

    await replaceSourceSpans(
      ORG,
      { documentTable: 'concept2cure_artifacts', documentId: String(artifactPk) },
      [{ charStart: 0, charEnd: QUOTED.length, spanText: QUOTED, sourceId, usage: 'quoted' }],
      { createdBy: String(USER) },
      { query: wrap } as any,
    );

    await sealVerifiedVersion(baseInput({ artifactPk, artifactExternalId: 'artifact_persisted' }));

    const rows = await spans();
    const sourceSpans = rows.filter((s) => s.provenance_kind === 'cre_evidence_source');
    const authorSpans = rows.filter((s) => s.provenance_kind === 'author_assertion');

    // The citation survived the seal, at its own offsets, still naming its source.
    expect(sourceSpans).toHaveLength(1);
    expect(Number(sourceSpans[0].char_start)).toBe(0);
    expect(Number(sourceSpans[0].char_end)).toBe(QUOTED.length);
    expect(String(sourceSpans[0].reference_id)).toBe(String(sourceId));

    // The remainder — and only the remainder — became the signer's assertion.
    expect(authorSpans.length).toBeGreaterThanOrEqual(1);
    expect(authorSpans.every((s) => Number(s.char_start) >= QUOTED.length)).toBe(true);
  });

  it('FAILS CLOSED — a broken lineage write rolls the seal back, signature included', async () => {
    await h.holder.pg.exec(`ALTER TABLE document_span_lineage RENAME TO document_span_lineage_hidden;`);
    try {
      await expect(sealVerifiedVersion(baseInput())).rejects.toThrow();

      // No signature over text the system could not attribute, and no orphan
      // artifact left behind by the fallback insert.
      expect(await count('concept2cure_signatures')).toBe(0);
      expect(await count('concept2cure_artifacts')).toBe(0);
      expect(await count('concept2cure_artifact_versions')).toBe(0);
    } finally {
      await h.holder.pg.exec(
        `ALTER TABLE document_span_lineage_hidden RENAME TO document_span_lineage;`,
      );
    }
  });
});
