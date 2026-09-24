/**
 * The document catalog and its read receipts are visible only to the tenant
 * that owns the DOCUMENT — row D3, the local half.
 *
 * ── The exposure this pins closed ────────────────────────────────────────────
 * migrations/20260905_document_catalog.sql created vault.document_catalog and
 * vault.document_read_receipts with no row-level security and no policy. Their
 * sibling vault.document_chunks, created one file later, has four. Neither
 * table carries a tenant column: ownership is the document_id foreign key into
 * vault.documents, which IS policied — so the catalog's isolation rested
 * entirely on every application query remembering to join through it.
 *
 * Reproduced on real PostgreSQL as the production runtime role (non-superuser,
 * not the owner, RLS enforcing, sponsor A's tenant settings), 2026-09-24:
 *   · SELECT returned sponsor B's catalog row — summary "CP-200 batch record,
 *     lot 42 OOS", key_data {"lot":"42","assay_pct":91.2};
 *   · UPDATE of B's summary and key_data succeeded;
 *   · INSERT of a forged 'cataloged' row for B's document succeeded;
 *   · INSERT of a full-coverage read receipt on B's document succeeded — the
 *     proof completeCatalog trusts before it accepts a comprehension record,
 *     so a cross-tenant write could satisfy the coverage gate;
 *   · DELETE of B's receipt succeeded.
 * No HTTP path exploits it today: every lane query joins through vault.documents
 * or is keyed on an id loadDocumentForOrg resolved. That is what "isolation
 * rests on application predicates" means, and it is not what D3 asks for.
 *
 * ── Why this runs as a minted NON-SUPERUSER ───────────────────────────────────
 * A superuser bypasses RLS unconditionally and the table owner does unless the
 * table is FORCEd, so the lane's other dbtests — which reach the database
 * through the application pool on an owner connection — cannot see a policy at
 * all. This suite connects through the harness's throwaway role, provisioned by
 * the real scripts/db/provision-app-role.mjs, with the same four session
 * settings server/db/poolInstrumentation.ts applies to every scoped statement.
 *
 * ── Why both directions, and a positive half ─────────────────────────────────
 * "0 rows visible" is equally true of a working policy and of a table nobody
 * seeded. Each tenant must see EXACTLY its own row before the absence of the
 * other's means anything.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, withSession, type ScratchSchema } from './harness';

const MIGRATION = path.join(__dirname, '../../migrations/20260905_document_catalog.sql');
const TABLES = ['document_catalog', 'document_read_receipts'] as const;
const PREFIX = 'dbtest-catalog-iso';

interface Tenant {
  orgId: number;
  orgUuid: string;
  programId: string;
  documentId: string;
  /** A second document of the same tenant with NO catalog row, for the forge case. */
  bareDocumentId: string;
  receiptId: number;
}

let scratch: ScratchSchema;
let A: Tenant;
let B: Tenant;

async function seedTenant(tag: string): Promise<Tenant> {
  const q = (sql: string, params?: unknown[]) => scratch.ownerPool.query(sql, params as any);
  const org = await q(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PREFIX} ${tag}`, `${PREFIX}-${tag}`],
  );
  const orgId = Number(org.rows[0].id);
  const orgUuid = String(org.rows[0].uuid);
  const prog = await q(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4) RETURNING id`,
    [`${PREFIX} ${tag} program`, `DBTEST-ISO-${tag}`.toUpperCase(), orgId, `${tag} 5mg`],
  );
  const programId = String(prog.rows[0].id);
  const doc = async (suffix: string) =>
    String(
      (
        await q(
          `INSERT INTO vault.documents
             (program_id, organization_id, document_code, document_title, document_type,
              file_name, mime_type, file_size, content_hash, version, processing_status)
           VALUES ($1, $2, $3, $4, 'OTHER', $5, 'text/plain', 10, $6, '1.0', 'INDEXED')
           RETURNING id`,
          [
            programId,
            orgId,
            `${PREFIX}-${tag}-${suffix}`,
            `Sponsor ${tag} ${suffix}`,
            `${tag}-${suffix}.txt`,
            (tag + suffix).padEnd(64, '0').slice(0, 64),
          ],
        )
      ).rows[0].id,
    );
  const documentId = await doc('doc');
  const bareDocumentId = await doc('bare');
  await q(
    `INSERT INTO vault.document_catalog
       (document_id, content_hash, catalog_status, char_count, summary, key_data)
     VALUES ($1, $2, 'cataloged', 100, $3, $4::jsonb)`,
    [documentId, (tag + 'doc').padEnd(64, '0').slice(0, 64), `Sponsor ${tag} summary`, JSON.stringify({ lot: tag })],
  );
  const receipt = await q(
    `INSERT INTO vault.document_read_receipts (document_id, content_hash, char_start, char_end, read_by)
     VALUES ($1, $2, 0, 100, 1) RETURNING id`,
    [documentId, (tag + 'doc').padEnd(64, '0').slice(0, 64)],
  );
  return { orgId, orgUuid, programId, documentId, bareDocumentId, receiptId: Number(receipt.rows[0].id) };
}

/** Exactly the settings pool instrumentation applies to a scoped statement. */
function scopeOf(t: Tenant): Record<string, string> {
  return {
    'app.rls_enforce': 'on',
    'app.current_tenant_id': String(t.orgId),
    'app.current_org_id': t.orgUuid,
    'app.current_user_role': 'admin',
  };
}

async function cleanup(): Promise<void> {
  await scratch.ownerPool.query(
    `DELETE FROM vault.documents WHERE document_code LIKE $1`,
    [`${PREFIX}-%`],
  );
  await scratch.ownerPool.query(`DELETE FROM regulatory_programs WHERE name LIKE $1`, [`${PREFIX} %`]);
}

beforeAll(async () => {
  scratch = await createScratchSchema(databaseUrl);
  // The migration under test, applied here rather than assumed, so this suite
  // exercises the file as committed regardless of what the surrounding job ran.
  await scratch.ownerPool.query(fs.readFileSync(MIGRATION, 'utf8'));
  await scratch.connectAsRuntimeRole();
  await cleanup();
  A = await seedTenant('a');
  B = await seedTenant('b');
}, 120_000);

afterAll(async () => {
  if (!scratch) return;
  await cleanup().catch(() => {});
  await scratch.destroy();
});

describe('vault.document_catalog and vault.document_read_receipts are tenant-isolated', () => {
  it('both tables have RLS enabled and a policy for every command', async () => {
    const { rows } = await scratch.ownerPool.query(
      `SELECT c.relname, c.relrowsecurity,
              ARRAY(SELECT p.polcmd::text FROM pg_policy p WHERE p.polrelid = c.oid ORDER BY 1) AS cmds
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'vault' AND c.relname = ANY($1::text[])`,
      [TABLES],
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.relrowsecurity, `vault.${r.relname} has RLS disabled`).toBe(true);
      // r = SELECT, a = INSERT, w = UPDATE, d = DELETE
      expect(r.cmds, `vault.${r.relname} policies`).toEqual(['a', 'd', 'r', 'w']);
    }
  });

  for (const table of TABLES) {
    it(`${table}: each tenant reads its own row and not the other's`, async () => {
      const visible = (viewer: Tenant, owner: Tenant) =>
        withSession(scratch.runtimePool!, scopeOf(viewer), async client => {
          const res = await client.query(
            `SELECT COUNT(*)::int AS n FROM vault.${table} WHERE document_id = $1`,
            [owner.documentId],
          );
          return res.rows[0].n as number;
        });
      // Positive half first: without it the negative half proves nothing.
      expect(await visible(A, A), `A cannot see its OWN ${table} row`).toBe(1);
      expect(await visible(B, B), `B cannot see its OWN ${table} row`).toBe(1);
      expect(await visible(A, B), `A can read B's ${table} row`).toBe(0);
      expect(await visible(B, A), `B can read A's ${table} row`).toBe(0);
    });
  }

  it("A cannot overwrite B's comprehension record", async () => {
    const updated = await withSession(scratch.runtimePool!, scopeOf(A), client =>
      client.query(
        `UPDATE vault.document_catalog SET summary = 'overwritten by A', key_data = '{"lot":"forged"}'::jsonb
          WHERE document_id = $1`,
        [B.documentId],
      ),
    );
    expect(updated.rowCount).toBe(0);
    const { rows } = await scratch.ownerPool.query(
      `SELECT summary FROM vault.document_catalog WHERE document_id = $1`,
      [B.documentId],
    );
    expect(rows[0].summary).toBe('Sponsor b summary');
  });

  it("A cannot forge a catalog row for B's document", async () => {
    await expect(
      withSession(scratch.runtimePool!, scopeOf(A), client =>
        client.query(
          `INSERT INTO vault.document_catalog (document_id, content_hash, catalog_status, summary)
           VALUES ($1, $2, 'cataloged', 'forged by A')`,
          [B.bareDocumentId, 'f'.repeat(64)],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("A cannot plant a read receipt on B's document — the proof the coverage gate trusts", async () => {
    await expect(
      withSession(scratch.runtimePool!, scopeOf(A), client =>
        client.query(
          `INSERT INTO vault.document_read_receipts (document_id, content_hash, char_start, char_end, read_by)
           VALUES ($1, $2, 0, 100, 1)`,
          [B.documentId, 'b'.padEnd(64, '0')],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("A cannot delete B's read receipt", async () => {
    const deleted = await withSession(scratch.runtimePool!, scopeOf(A), client =>
      client.query(`DELETE FROM vault.document_read_receipts WHERE id = $1`, [B.receiptId]),
    );
    expect(deleted.rowCount).toBe(0);
  });

  it('a tenant still writes its OWN catalog row and receipt — the policy is not a blanket deny', async () => {
    await withSession(scratch.runtimePool!, scopeOf(A), async client => {
      const ins = await client.query(
        `INSERT INTO vault.document_catalog (document_id, content_hash, catalog_status)
         VALUES ($1, $2, 'extracted')`,
        [A.bareDocumentId, 'a'.repeat(64)],
      );
      expect(ins.rowCount).toBe(1);
      const upd = await client.query(
        `UPDATE vault.document_catalog SET summary = 'A studied it' WHERE document_id = $1`,
        [A.documentId],
      );
      expect(upd.rowCount).toBe(1);
      const rec = await client.query(
        `INSERT INTO vault.document_read_receipts (document_id, content_hash, char_start, char_end, read_by)
         VALUES ($1, $2, 0, 50, 1)`,
        [A.documentId, 'a'.padEnd(64, '0')],
      );
      expect(rec.rowCount).toBe(1);
    });
  });
});
