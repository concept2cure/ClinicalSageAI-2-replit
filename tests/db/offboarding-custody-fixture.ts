/**
 * The fixture of tenant-offboarding-custody.dbtest.ts (P-58, D6, 2026-10-29;
 * docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
 *
 * Lane "obc": organisations 90871 (D) and 90872 (E), users
 * `obc-*@example.invalid`. Each run starts from nothing of this lane's: the
 * rows a previous run left (a purged organisation keeps its certificate, its
 * custody signature and its chained audit rows) are removed first, as the
 * table owner with replication triggers off (teardown only, never a product
 * path).
 *
 * The held tables are the ones the founder's decision names (P-58): the 18
 * PURGE_REFERRERS_NOT_ERASED held out of the purge on 2026-10-29, and the five
 * that name one of them with no delete action, reached once their parents are
 * erased. Each gets one row for D and one for E from the catalog
 * (tenant-purge-row-seeder.ts), each naming its own tenant's parents. A review
 * route's task and a reg_questions row are laid down past their triggers, as
 * legacy rows a tenant may still hold. D also holds two signatures with real
 * manifests: one whose §11.200 hash matches its manifest, one whose does not.
 *
 * The stack is production's: the auth boundary, then the tenant-export router
 * on the runtime pool (app_service, NOSUPERUSER, NOBYPASSRLS, RLS enforced).
 */
import express from 'express';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { mintToken } from './compliance-review-fixture';
import { TenantRowSeeder, ownVaultProgram, qualified, type SeededRow } from './tenant-purge-row-seeder';
import { manifestSignatureHash } from '../../server/services/part11/signature-persistence';

export const ORG_D = 90871;
export const ORG_E = 90872;
export const ORGS = [ORG_D, ORG_E];
export const TAG = 'obc';
export const PASSWORD = 'Obc-Custody-Handover-2026!';
export const CALLER = 'tests/db/tenant-offboarding-custody.dbtest.ts';

/** The 18 tables held out of the purge on 2026-10-29 (P-58's list). */
export const DECIDED_HELD = [
  'account_canon_resolution_log', 'account_events', 'ana_outcome_log', 'bundle_execution_receipts', 'cer_approvals',
  'data_lineage_records', 'document_audit_trail', 'electronic_signatures', 'evidence_chain_records', 'gate_approvals',
  'governance_boundary_transitions', 'immutable_report_records', 'ivdr_cdx_status_history', 'ivdr_evidence_result_history',
  'ivdr_validation_parameter_history', 'reg_questions', 'review_routes', 'rule_execution_log',
] as const;
/** Tables that name a held table with no delete action: erased before it once it is erased. */
export const REACHED_HELD = [
  'compliance_review_records', 'indemnification_attestations', 'report_atom_provenance', 'report_seal_events', 'reg_responses',
] as const;
/** Held by the lead's decision of 2026-10-29: a deviation is a GxP quality record (P-57's own table). */
export const QUALITY_HELD = ['qc_deviations'] as const;
export const ALL_HELD: readonly string[] = [...DECIDED_HELD, ...REACHED_HELD, ...QUALITY_HELD];
/**
 * The tables an export read in the platform scope returned none of a tenant's
 * rows from, with nothing failed (P-58's data return, 2026-10-29;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-0/): the Vault's policies
 * decide on the organization uuid, the knowledge graph's on the tenant id
 * alone. Seeded for both tenants; not held records.
 */
export const OWN_SCOPE_ONLY: readonly string[] = [
  'vault.documents', 'vault.document_catalog', 'vault.document_read_receipts', 'vault.evidence_citations',
  'public.citation_chains', 'public.knowledge_graph_nodes', 'public.knowledge_graph_edges', 'public.lumen_knowledge_graph_edges',
];
/** Written past their triggers: reg_questions refuses INSERT from every role since 2026-10-19. */
const LAID_DOWN = new Set(['reg_questions', 'reg_responses']);

export interface Person { id: number; token: string }
export const people = {} as Record<'adminD' | 'memberD' | 'adminE', Person>;
export let owner: Pool;
export const seeders = new Map<number, TenantRowSeeder>();
export const users = new Map<number, number>();
/** The signatures each organisation holds with a manifest, and whether its hash matches. */
export const signatures = new Map<number, Array<{ id: number; verified: boolean }>>();
/** The review-route task each organisation holds. */
export const routeTasks = new Map<number, SeededRow>();

async function upsertUser(key: keyof typeof people, org: number, role: string): Promise<Person> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status, default_organization_id)
     VALUES ($1, $2, $3, 'active', $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
       failed_login_attempts = 0, locked_until = NULL, mfa_enabled = false, mfa_secret = NULL,
       mfa_totp_last_step = NULL, password_changed_at = NULL, default_organization_id = EXCLUDED.default_organization_id
     RETURNING id`,
    [`${TAG}-${key.toLowerCase()}@example.invalid`, `Custody ${key}`, await bcrypt.hash(PASSWORD, 4), org],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [org, id, role],
  );
  return { id, token: await mintToken(id, org, role) };
}

/** Everything of this lane's, as the table owner with replication triggers off (teardown only). */
export async function cleanup(): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query("SET session_replication_role = 'replica'");
    const { rows } = await c.query<{ t: string; col: string }>(
      `SELECT DISTINCT ON (c.table_schema, c.table_name) c.table_schema || '.' || c.table_name AS t, c.column_name AS col
         FROM information_schema.columns c JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema IN ('public', 'vault') AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
          AND c.data_type IN ('integer', 'bigint')
        ORDER BY c.table_schema, c.table_name, c.column_name`);
    for (const { t, col } of rows) {
      if (t === 'public.organizations') continue;
      await c.query(`DELETE FROM ${t} WHERE "${col}" = ANY($1::int[])`, [ORGS]).catch(() => undefined);
    }
    for (const org of ORGS) {
      const seeded = seeders.get(org)?.rows ?? [];
      for (const r of [...seeded].reverse()) {
        const cols = Object.keys(r.key);
        await c.query(
          `DELETE FROM ${r.table} WHERE ${cols.map((k, i) => `"${k}"::text = $${i + 1}`).join(' AND ')}`,
          cols.map((k) => r.key[k]),
        ).catch(() => undefined);
      }
    }
    await c.query(`DELETE FROM users WHERE email LIKE $1`, [`${TAG}-%@example.invalid`]);
    await c.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [ORGS]);
  } finally {
    await c.query("SET session_replication_role = 'origin'").catch(() => undefined);
    c.release();
  }
}

/** Every table the purge deletes (the list, its predicates, their cascades), for the seeder's optional keys. */
export async function purgedTables(listed: readonly string[]): Promise<Set<string>> {
  const { rows } = await owner.query<{ t: string }>(
    `WITH RECURSIVE purged(oid) AS (
       SELECT to_regclass(t)::oid FROM unnest($1::text[]) t WHERE to_regclass(t) IS NOT NULL
       UNION
       SELECT con.conrelid FROM purged JOIN pg_constraint con
           ON con.confrelid = purged.oid AND con.contype = 'f' AND con.confdeltype = 'c')
     SELECT n.nspname || '.' || c.relname AS t
       FROM purged JOIN pg_class c ON c.oid = purged.oid JOIN pg_namespace n ON n.oid = c.relnamespace`,
    [listed.map(qualified)]);
  return new Set(rows.map((r) => r.t));
}

export async function provision(): Promise<void> {
  if (!process.env.APP_DATABASE_URL) throw new Error('[obc] APP_DATABASE_URL is required: owner execution proves nothing about RLS.');
  process.env.AUTH_BOUNDARY_MODE = 'enforce';
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();
  for (const org of ORGS) {
    await owner.query(`INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active')`, [org, `${TAG}-custody-${org}`]);
  }
  people.adminD = await upsertUser('adminD', ORG_D, 'admin');
  people.memberD = await upsertUser('memberD', ORG_D, 'member');
  people.adminE = await upsertUser('adminE', ORG_E, 'admin');
  users.set(ORG_D, people.adminD.id);
  users.set(ORG_E, people.adminE.id);
}

/** One row past the table's own triggers, as a legacy row a tenant may still hold. */
async function layDown(seeder: TenantRowSeeder, table: string): Promise<void> {
  try {
    await seeder.seed(table);
    return;
  } catch {
    // reg_questions (and anything naming it) refuses INSERT from every role.
  }
  await owner.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
  try {
    await seeder.seed(table);
  } finally {
    await owner.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
  }
}

/** A review route's member task, past the route guard (a fixture row, not the route writer's path). */
async function routeTask(org: number, seeder: TenantRowSeeder): Promise<SeededRow> {
  const route = await seeder.seed('review_routes');
  const c = await owner.connect();
  try {
    await c.query("SET session_replication_role = 'replica'");
    const { rows } = await c.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id, review_route_id, review_role, review_step)
       VALUES ($1, $2, 'Vault', 'Review: obc fixture', 'pending', $3, $4, 'reviewer', 1) RETURNING id`,
      [`ROUTE-${String(route.id).slice(0, 8)}-${users.get(org)}`, org, users.get(org), route.id]);
    const row: SeededRow = { table: 'public.unified_tasks', organizationId: org, key: { id: String(rows[0].id) } };
    seeder.rows.push(row);
    return row;
  } finally {
    await c.query("SET session_replication_role = 'origin'").catch(() => undefined);
    c.release();
  }
}

/** Two signatures with manifests: one whose hash is the manifest's, and (for D) one whose is not. */
async function manifestSignatures(org: number, seeder: TenantRowSeeder): Promise<void> {
  const out: Array<{ id: number; verified: boolean }> = [];
  for (const verified of org === ORG_D ? [true, false] : [true]) {
    const manifest = { kind: 'governed-sign', command: 'sign', target: `${TAG}-fixture:${org}:${verified}`, organizationId: org, meaning: 'approval' };
    const hash = verified ? manifestSignatureHash(manifest) : manifestSignatureHash({ ...manifest, meaning: 'review' });
    const { rows } = await owner.query(
      `INSERT INTO electronic_signatures (organization_id, signed_target, signature_type, signature_purpose, signature_meaning,
         signer_id, signer_name, signer_email, authentication_method, authentication_timestamp, signature_hash, signature_manifest,
         is_valid, signed_at, binding_basis, bound_payload_digest)
       VALUES ($1, $2, 'governed-action', 'obc fixture', 'approval', $3, 'Custody fixture', 'obc@example.invalid', 'password', now(),
               $4, $5::json, true, now(), 'governed-action-sha256-chain', $6)
       RETURNING id`,
      [org, manifest.target, users.get(org), hash, JSON.stringify(manifest), 'c'.repeat(64)]);
    out.push({ id: Number(rows[0].id), verified });
    seeder.rows.push({ table: 'public.electronic_signatures', organizationId: org, key: { id: String(rows[0].id) } });
  }
  signatures.set(org, out);
}

/** One row of every held table for D and for E, each naming its own tenant's parents. */
export async function seedHeld(exercised: ReadonlySet<string>): Promise<string[]> {
  const unseedable: string[] = [];
  const reference = new Map<string, Record<string, unknown>>();
  for (const org of ORGS) {
    const seeder = new TenantRowSeeder({ db: owner, organizationId: org, userId: users.get(org)!, exercised, reference, tag: TAG });
    seeders.set(org, seeder);
    for (const t of ALL_HELD) {
      if (t === 'review_routes') continue;
      try {
        if (LAID_DOWN.has(t)) await layDown(seeder, t);
        else await seeder.seed(t);
      } catch (error) {
        unseedable.push(`${t} (${org}): ${(error as Error).message.slice(0, 160)}`);
      }
    }
    for (const t of OWN_SCOPE_ONLY) {
      try {
        await seeder.seed(t);
      } catch (error) {
        unseedable.push(`${t} (${org}): ${(error as Error).message.slice(0, 160)}`);
      }
    }
    await ownVaultProgram(owner, seeder);
    routeTasks.set(org, await routeTask(org, seeder));
    await manifestSignatures(org, seeder);
  }
  return unseedable;
}

/** The production stack: the auth boundary, then the tenant-export router on the runtime pool. */
export async function stack(): Promise<express.Express> {
  const { createAuthBoundary } = await import('../../server/middleware/authBoundary');
  const { default: tenantExport } = await import('../../server/routes/tenant-export');
  const a = express();
  a.use(express.json());
  a.use('/api', createAuthBoundary());
  a.use('/api/tenant-export', tenantExport);
  return a;
}

export function auth(p: Person) {
  return { Authorization: `Bearer ${p.token}` };
}

export async function teardown(): Promise<void> {
  if (!owner) return;
  await cleanup().catch((err) => console.warn('[obc] cleanup left rows:', (err as Error).message));
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner.end();
}
