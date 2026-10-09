#!/usr/bin/env node
/**
 * audit-runtime-grants.mjs — is the runtime role able to reach every table the
 * owner created, and nothing more than the recipe allows on the audit store?
 *
 *     DATABASE_OWNER_URL='postgres://owner@…/db' \
 *     RUNTIME_DB_ROLE=app_service \
 *     node scripts/db/audit-runtime-grants.mjs [--role <name>] [--json <path>]
 *
 * ── Why (2026-09-21, IQ-DEV-001) ─────────────────────────────────────────────
 * IQ-001 check IQ-07 found the runtime role `c2c` unable to SELECT 264 tables
 * (183 in public, all owned by `postgres`) after install-fresh + deploy-migrate
 * had run as the owner: grants were refreshed only when APP_SERVICE_DB_PASSWORD
 * was set. deploy-migrate now refreshes grants for any identifiable runtime
 * role and verifies them (step 5). This command is that verification on its
 * own, for an operator or a validation runner, with the same inventory the IQ
 * check records (`db-role-denied-tables.json`: deniedCount + denied[]).
 *
 * The role is `--role`, else the runtime role provision-app-role.mjs
 * identifies from the environment (RUNTIME_DB_ROLE → APP_SERVICE_DB_PASSWORD →
 * APP_DATABASE_URL → DATABASE_URL when it differs from the connection's role),
 * else the connection's own role. It only READS the catalog, so it runs on any
 * connection — the owner auditing the app role, or the app role auditing
 * itself.
 *
 * Exit: 0 every relation reachable and the audit ceiling holds
 *       1 denied relations, excess audit privileges, or the role does not exist
 *       2 configuration
 */

import fs from 'node:fs';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { resolveDatabaseUrl, sslFor, APPLY_URL_VARS } from './connection.mjs';
import { auditRuntimeRoleGrants, resolveRuntimeRole } from './provision-app-role.mjs';

dotenv.config({ quiet: true });

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** How the audit reads as one line per problem, for a transcript. */
export function describeAudit(audit) {
  const lines = [];
  if (!audit.exists) {
    lines.push(`✗ runtime role ${audit.role} does not exist`);
    return lines;
  }
  lines.push(
    `role ${audit.role}: superuser=${audit.attrs.rolsuper} bypassrls=${audit.attrs.rolbypassrls} login=${audit.attrs.rolcanlogin}; ` +
      `${audit.relations} application relations audited`,
  );
  lines.push(`denied: ${audit.denied.length}`);
  for (const d of audit.denied) lines.push(`  - ${d.relation}: missing ${d.missing.join(', ')}`);
  if (audit.schemasWithoutUsage.length) {
    lines.push(`schemas without USAGE: ${audit.schemasWithoutUsage.join(', ')}`);
  }
  lines.push(`excess beyond the audit ceiling (non-owned relations): ${audit.excess.length}`);
  for (const e of audit.excess) lines.push(`  - ${e.relation}: holds ${e.held.join(', ')}`);
  if (audit.ownedAppendOnly.length) {
    lines.push(`✗ append-only store OWNED by the runtime role: ${audit.ownedAppendOnly.join(', ')}`);
  }
  if (audit.ownedInOverrideSchemas) {
    lines.push(
      `note: ${audit.ownedInOverrideSchemas} override-schema relation(s) are owned by ${audit.role} ` +
        '(ownership, not a grant; not counted as excess)',
    );
  }
  return lines;
}

async function main() {
  let url;
  try {
    url = resolveDatabaseUrl(APPLY_URL_VARS);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(2);
  }
  const client = new Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  try {
    const me = (await client.query('SELECT current_user AS role, current_database() AS db')).rows[0];
    let role = arg('--role');
    let source = '--role';
    if (!role) {
      const ident = resolveRuntimeRole(process.env, { ownerRole: me.role });
      if (ident) {
        role = ident.role;
        source = ident.source;
      } else {
        role = me.role;
        source = 'connection (no distinct runtime role identified)';
      }
    }
    console.info(`▶ grant audit on ${me.db} as ${me.role}; auditing role ${role} (from ${source})`);
    const audit = await auditRuntimeRoleGrants(client, role);
    for (const l of describeAudit(audit)) console.info(`  ${l}`);

    const jsonPath = arg('--json');
    if (jsonPath) {
      const out = {
        role: audit.role,
        attrs: audit.attrs,
        auditedAt: new Date().toISOString(),
        database: me.db,
        connectedAs: me.role,
        relations: audit.relations,
        deniedCount: audit.denied.length,
        denied: audit.denied.map((d) => d.relation),
        deniedDetail: audit.denied,
        excess: audit.excess,
        ownedAppendOnly: audit.ownedAppendOnly,
        ownedInOverrideSchemas: audit.ownedInOverrideSchemas,
        schemasWithoutUsage: audit.schemasWithoutUsage,
      };
      fs.writeFileSync(jsonPath, `${JSON.stringify(out, null, 2)}\n`);
      console.info(`  written: ${jsonPath}`);
    }

    const bad = !audit.exists || audit.denied.length || audit.excess.length || audit.ownedAppendOnly.length;
    if (bad) {
      console.error(
        `\n✗ runtime role ${role} does not hold the recipe posture. Re-run deploy-migrate as the owner ` +
          '(step 4 refreshes grants for an identified runtime role); excess privileges on the audit ' +
          'store must be REVOKEd by the operator — the recipe never grants them.',
      );
      process.exit(1);
    }
    console.info(`\n✓ runtime role ${role} holds the recipe posture on all ${audit.relations} relations.`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
