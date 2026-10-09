/**
 * readiness-contract.mjs — the schema contract /readyz enforces, as data plus
 * one verifier, so every applier and the provisioner check the SAME thing the
 * running server checks.
 *
 * ── Why this file exists (2026-09-20, W2 / launch row D1) ────────────────────
 * /readyz reports `schema: ok` only when server/startup/services.ts →
 * verifyDatabaseConnection() records 'ready' or 'degraded'. That verdict is
 * built from three lists that lived in two TypeScript files the deploy-time
 * appliers cannot import (they run as plain node inside the production image,
 * where nothing compiles TypeScript):
 *
 *   CRITICAL_TABLES            server/db/ensureCoreTables.ts   organizations, users
 *   REQUIRED_SCHEMAS           server/db/ensureCoreTables.ts   public, vault, extensions
 *   SECURITY_CRITICAL_TABLES   server/startup/services.ts      auth / RBAC / licensing
 *
 * plus the `vector` extension and the authoring subsystem. deploy-migrate
 * verified only the authoring half, so a database could pass the deploy job and
 * still boot to `schema: down` — measured on 2026-09-20: install-fresh alone
 * leaves `public.licenses` (SECURITY_CRITICAL) and `audit.tamper_proof_log`
 * (the Part 11 store) absent, because both are created by files that only
 * deploy-migrate applies, and nothing before the boot itself said so.
 *
 * The lists below are the single copy the scripts use. The TypeScript side
 * exports its lists and server/db/__tests__/readiness-contract.test.ts pins the
 * two to the same table, so a table added to one and not the other fails CI
 * rather than surfacing as a deploy that is green and a probe that is red.
 *
 * Every lookup here goes through pg_class / pg_namespace, never
 * information_schema: information_schema is privilege-filtered and reads
 * `absent` for a table the connecting role merely cannot see, which fails OPEN
 * for a "does this exist" question. to_regclass is not used either — it throws
 * on a schema the role has no USAGE on, which is exactly the app-role case this
 * verifier is run in.
 *
 * ── Runtime-role reach (2026-09-21, IQ-DEV-001) ──────────────────────────────
 * When a runtime role is under test — the app connection itself
 * (`asRuntimeRole`) or a role named by the owner (`runtimeRole`) — the verdict
 * also covers the GRANT AUDIT in provision-app-role.mjs: every application
 * relation reachable with the recipe's privileges, and nothing beyond the
 * append-only ceiling on the audit store. Until this the contract checked only
 * the 27 contract tables, so a deploy could verify green while the runtime
 * role could not read 183 of the owner's public tables (measured 2026-09-20).
 */

import { auditRuntimeRoleGrants } from './provision-app-role.mjs';

/** Schemas /readyz requires (ensureCoreTables.ts requiredSchemas). */
export const REQUIRED_SCHEMAS = Object.freeze(['public', 'vault', 'extensions']);

/** Extensions /readyz requires (ensureCoreTables.ts: `vector`). */
export const REQUIRED_EXTENSIONS = Object.freeze(['vector']);

/**
 * Tables whose absence sets schema readiness to 'missing' outright
 * (ensureCoreTables.ts CRITICAL_TABLES).
 */
export const CRITICAL_TABLES = Object.freeze(['organizations', 'users']);

/**
 * "Important" tables that services.ts promotes to readiness-failing because
 * auth, RBAC, token revocation and licensing cannot run without them
 * (services.ts SECURITY_CRITICAL_TABLES).
 */
export const SECURITY_CRITICAL_TABLES = Object.freeze([
  'organization_users',
  'platform_role_grants',
  'revoked_tokens',
  'licenses',
  'audit_logs',
]);

/**
 * Non-public objects the runtime needs at boot that no /readyz list covers but
 * a production boot cannot do without:
 *
 *   audit.tamper_proof_log   the 21 CFR Part 11 tamper-proof store. Created ONLY
 *                            by db/migrations/20260813_audit_tamper_proof_log.sql
 *                            (deploy-migrate). AUDIT_TRAIL_ENABLED=true — the
 *                            production posture — needs it; without it the audit
 *                            service falls back to console logging, which is
 *                            the silent failure that file's header describes.
 */
export const REQUIRED_NON_PUBLIC_TABLES = Object.freeze([
  { schema: 'audit', name: 'tamper_proof_log' },
]);

/**
 * Base-schema sentinels deploy-migrate preflights on: one from drizzle push,
 * one from the raw migrations/ overlay. Listed here so the provisioner's final
 * check and the deploy preflight agree on what "provisioned" means.
 */
export const BASE_SCHEMA_SENTINELS = Object.freeze([
  'organizations',
  'users',
  'c2c_documents',
  'regulatory_programs',
]);

/** Existence via pg_class, for `{schema, name}` pairs. Returns the absent ones. */
async function absentTables(client, pairs) {
  if (pairs.length === 0) return [];
  const res = await client.query(
    `SELECT p.schema, p.name,
            EXISTS (
              SELECT 1 FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = p.schema AND c.relname = p.name
                 AND c.relkind IN ('r', 'p', 'v', 'm')
            ) AS present
       FROM unnest($1::text[], $2::text[]) AS p(schema, name)`,
    [pairs.map((p) => p.schema), pairs.map((p) => p.name)],
  );
  return res.rows.filter((r) => !r.present).map((r) => ({ schema: r.schema, name: r.name }));
}

const fq = (t) => `${t.schema}.${t.name}`;

/**
 * Verify the core of the /readyz schema contract on `client`.
 *
 * Checks, in order: required schemas, required extensions, CRITICAL_TABLES,
 * SECURITY_CRITICAL_TABLES, REQUIRED_NON_PUBLIC_TABLES, and — when
 * `authoringTables` is supplied — the authoring subsystem as a unit. When
 * `asRuntimeRole` is true the connection is treated as the request-serving
 * role; when `runtimeRole` names one (an owner connection verifying the role
 * the server will use), that role is tested instead. Either way the role must
 * be neither a superuser nor BYPASSRLS, must hold SELECT on every table above,
 * and must pass the full grant audit (provision-app-role.mjs): every
 * application relation reachable with the recipe's privileges and nothing
 * beyond the append-only ceiling on the audit store. The grant refresh in
 * provision-app-role.mjs is what makes that true; a table it missed would 500
 * on first read.
 *
 * @param {{query: Function}} client
 * @param {{log?: (m: string) => void, authoringTables?: readonly string[], asRuntimeRole?: boolean, runtimeRole?: string|null}} [opts]
 * @returns {Promise<{ok: boolean, failures: string[], role: string, roleIsSuperuser: boolean, roleBypassesRls: boolean, runtimeRole: string|null, grantAudit: object|null}>}
 */
export async function verifyReadinessContract(
  client,
  { log = () => {}, authoringTables = [], asRuntimeRole = false, runtimeRole = null } = {},
) {
  const failures = [];

  // Who is asking — printed so a transcript shows which role the verdict is for.
  const who = await client.query(
    `SELECT current_user AS role, current_database() AS db, r.rolsuper, r.rolbypassrls
       FROM pg_roles r WHERE r.rolname = current_user`,
  );
  const role = who.rows[0]?.role ?? '(unknown)';
  const roleIsSuperuser = Boolean(who.rows[0]?.rolsuper);
  const roleBypassesRls = Boolean(who.rows[0]?.rolbypassrls);
  log(
    `  role ${role} on ${who.rows[0]?.db} (superuser=${roleIsSuperuser}, bypassrls=${roleBypassesRls})`,
  );

  // 1. Schemas.
  const sch = await client.query(
    `SELECT s AS name, EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) AS present
       FROM unnest($1::text[]) AS s`,
    [REQUIRED_SCHEMAS],
  );
  const missingSchemas = sch.rows.filter((r) => !r.present).map((r) => r.name);
  log(`  schemas: ${REQUIRED_SCHEMAS.length - missingSchemas.length}/${REQUIRED_SCHEMAS.length} present`);
  if (missingSchemas.length) failures.push(`schemas missing: ${missingSchemas.join(', ')}`);

  // 2. Extensions.
  const ext = await client.query(
    `SELECT e AS name, EXISTS (SELECT 1 FROM pg_extension WHERE extname = e) AS present
       FROM unnest($1::text[]) AS e`,
    [REQUIRED_EXTENSIONS],
  );
  const missingExt = ext.rows.filter((r) => !r.present).map((r) => r.name);
  log(`  extensions: ${REQUIRED_EXTENSIONS.length - missingExt.length}/${REQUIRED_EXTENSIONS.length} installed`);
  if (missingExt.length) failures.push(`extensions missing: ${missingExt.join(', ')}`);

  // 3–5. Tables, grouped so the failure names the tier that is broken.
  const tiers = [
    ['critical tables', CRITICAL_TABLES.map((n) => ({ schema: 'public', name: n }))],
    ['security-critical tables', SECURITY_CRITICAL_TABLES.map((n) => ({ schema: 'public', name: n }))],
    ['Part 11 audit store', [...REQUIRED_NON_PUBLIC_TABLES]],
  ];
  if (authoringTables.length) {
    tiers.push(['authoring subsystem', authoringTables.map((n) => ({ schema: 'public', name: n }))]);
  }
  const allTables = [];
  for (const [label, pairs] of tiers) {
    const absent = await absentTables(client, pairs);
    log(`  ${label}: ${pairs.length - absent.length}/${pairs.length} present`);
    if (absent.length) failures.push(`${label} missing: ${absent.map(fq).join(', ')}`);
    allTables.push(...pairs);
  }

  // 6. Runtime-role posture and reach — the connection itself, or a named role.
  const roleUnderTest = runtimeRole || (asRuntimeRole ? role : null);
  let grantAudit = null;
  if (roleUnderTest) {
    grantAudit = await auditRuntimeRoleGrants(client, roleUnderTest);
    if (!grantAudit.exists) {
      failures.push(
        `runtime role ${roleUnderTest} does not exist — the request-serving pool could not connect as it; ` +
          'mint it (APP_SERVICE_DB_PASSWORD) or correct RUNTIME_DB_ROLE / APP_DATABASE_URL',
      );
    } else {
      const a = grantAudit.attrs;
      if (a.rolsuper || a.rolbypassrls) {
        failures.push(
          `runtime role ${roleUnderTest} is ${a.rolsuper ? 'a superuser' : 'BYPASSRLS'} — every ` +
            'tenant_isolation_policy is inert on this connection; production refuses to boot on it',
        );
      }

      // The contract tier, named: these are the tables /readyz and the boot
      // read first, so a gap here is reported by name before the full count.
      const deniedBy = new Map(grantAudit.denied.map((d) => [d.relation, d.missing]));
      const unreadable = allTables
        .map(fq)
        .filter((t) => deniedBy.has(t) && deniedBy.get(t).some((p) => p === 'SELECT' || p === 'USAGE'));
      log(`  SELECT reach: ${allTables.length - unreadable.length}/${allTables.length} contract tables readable by ${roleUnderTest}`);
      if (unreadable.length) {
        failures.push(
          `runtime role ${roleUnderTest} cannot SELECT: ${unreadable.join(', ')} — re-run the grant refresh ` +
            '(provision-app-role.mjs via deploy-migrate) as the owner',
        );
      }

      // The whole estate: every application relation, with the recipe's
      // privileges, and no more than the ceiling on the audit store.
      const reachable = grantAudit.relations - grantAudit.denied.length;
      log(
        `  grant audit: ${reachable}/${grantAudit.relations} application relations hold the recipe privileges for ` +
          `${roleUnderTest}; beyond the audit ceiling: ${grantAudit.excess.length}`,
      );
      const preview = (items, render) => {
        const shown = items.slice(0, 12).map(render);
        return items.length > 12 ? `${shown.join(', ')}, … (${items.length - 12} more)` : shown.join(', ');
      };
      if (grantAudit.denied.length) {
        failures.push(
          `runtime role ${roleUnderTest} lacks privileges on ${grantAudit.denied.length} relation(s): ` +
            `${preview(grantAudit.denied, (d) => `${d.relation} (${d.missing.join('/')})`)} — re-run deploy-migrate ` +
            'as the owner (step 4 refreshes grants for an identified runtime role); node scripts/db/audit-runtime-grants.mjs lists them all',
        );
      }
      if (grantAudit.excess.length) {
        failures.push(
          `runtime role ${roleUnderTest} holds privileges beyond the append-only ceiling on: ` +
            `${preview(grantAudit.excess, (e) => `${e.relation} (${e.held.join('/')})`)} — REVOKE them; the recipe ` +
            'never grants UPDATE/DELETE on audit and a widened audit store is not a deployable state',
        );
      }
      if (grantAudit.ownedAppendOnly.length) {
        failures.push(
          `runtime role ${roleUnderTest} OWNS the append-only store: ${grantAudit.ownedAppendOnly.join(', ')} — ` +
            'ownership confers UPDATE/DELETE regardless of grants; re-provision so a separate owner role creates it',
        );
      }
    }
  }

  return { ok: failures.length === 0, failures, role, roleIsSuperuser, roleBypassesRls, runtimeRole: roleUnderTest, grantAudit };
}
