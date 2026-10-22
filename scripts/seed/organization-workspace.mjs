/**
 * An organisation a seed script writes gets its own client workspace, from the
 * repair sweep every deploy already runs — never from a second writer.
 *
 * HT-01 (2026-10-18). On a database provisioned from empty, the documented
 * local setup (docs/LOCAL_TESTING.md: db:provision, then seed-admin) left the
 * seeded organisation with no client workspace, so every "create program"
 * answered NO_CLIENT_WORKSPACE until deploy-migrate happened to run again.
 * The application's three organisation creators call
 * ensureOrganizationDefaultWorkspace (server/services/c2c/organization-default-
 * workspace.ts); these scripts write organisations directly in plain SQL and
 * cannot import it. The deploy-time half of the same rule is
 * migrations/20260923_organization_default_client_workspace.sql — idempotent,
 * gated on an organisation having NO workspace, marking the row
 * defaultForOrganization, and asserting afterwards that none is left without
 * one. Executing that file is the rule, not a copy of it.
 *
 * Runs as one simple-protocol query, so its statements commit or fail
 * together; inside a caller's BEGIN they join that transaction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKSPACE_REPAIR_MIGRATION = 'migrations/20260923_organization_default_client_workspace.sql';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Give every organisation without a workspace its own, then return `orgId`'s
 * workspace id: the one marked as the organisation's own when there is one —
 * the row ensureProgramProjectAnchor prefers — else the oldest.
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} db a pg Pool or PoolClient
 * @param {number} orgId the organisation the caller has just written
 * @returns {Promise<number | null>}
 */
export async function ensureOrganizationWorkspace(db, orgId) {
  await db.query(fs.readFileSync(path.join(ROOT, WORKSPACE_REPAIR_MIGRATION), 'utf8'));
  const res = await db.query(
    `SELECT COALESCE(
       (SELECT min(id) FROM client_workspaces
         WHERE organization_id = $1 AND (metadata ->> 'defaultForOrganization') = 'true'),
       (SELECT min(id) FROM client_workspaces WHERE organization_id = $1)
     ) AS id`,
    [orgId],
  );
  const id = res.rows[0]?.id;
  return id == null ? null : Number(id);
}
