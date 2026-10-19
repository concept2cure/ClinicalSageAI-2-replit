/** Real native test prerequisites; all access decisions stay in production readers.
 * Fresh disposable-DB namespaces preserve older retained rows/audit history.
 * This helper neither provisions a role nor constructs a permitted-program list. */
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import type { RequestSqlClient } from '../../server/db/requestDb';

export const nativeCatalogRunId = (): string => `${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;

export interface NativeCatalogActor {
  organizationId: number;
  organizationUuid: string;
  userId: number;
  role: string;
  caller: string;
}

/** Compare the declared owner/runtime target without printing credentials.
 * The default PostgreSQL port is equivalent to an explicit 5432. */
function nativeOwnerTarget(): URL {
  try {
    return new URL(databaseUrl);
  } catch {
    throw new Error('A valid disposable owner database target is required.');
  }
}

function requireNativeRuntimeDatabase(): string {
  const configured = process.env.APP_DATABASE_URL?.trim();
  if (!configured) throw new Error('A real restricted APP_DATABASE_URL is required.');
  const ownerTarget = nativeOwnerTarget();
  let runtimeTarget: URL;
  try {
    runtimeTarget = new URL(configured);
  } catch {
    throw new Error('A valid restricted application database target is required.');
  }
  if (ownerTarget.pathname !== runtimeTarget.pathname || ownerTarget.hostname !== runtimeTarget.hostname ||
      (ownerTarget.port || '5432') !== (runtimeTarget.port || '5432') || runtimeTarget.username !== 'app_service') {
    throw new Error('Owner and app_service runtime must target the same disposable database host, port and database.');
  }
  return decodeURIComponent(ownerTarget.pathname.slice(1));
}

/** The same lazy executor, switch pins and release as authenticated requests.
 * Owner connections are never used as the request/AnA executor. */
export async function withNativeCatalogClient<T>(
  actor: NativeCatalogActor,
  work: (sqlClient: RequestSqlClient) => Promise<T>,
): Promise<T> {
  const expectedDatabase = requireNativeRuntimeDatabase();
  const { getPool } = await import('../../server/db');
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { applySessionScope } = await import('../../server/db/sessionScope');
  const { LazyRequestDbClient } = await import('../../server/middleware/lazyRequestDbClient');
  const session = { tenantId: String(actor.organizationId), orgUuid: actor.organizationUuid, role: actor.role };
  return runWithTenantScope({ ...session, source: 'request', caller: actor.caller }, async () => {
    const sqlClient = new LazyRequestDbClient(getPool(), client => applySessionScope(client, session));
    try {
      const { rows } = await sqlClient.query(
        `SELECT current_database() AS database, current_user AS role, r.rolsuper, r.rolbypassrls,
                current_setting('app.rls_enforce', true) AS enforcement
           FROM pg_roles r WHERE r.rolname = current_user`,
      );
      const posture = rows[0];
      if (rows.length !== 1 || posture.database !== expectedDatabase || posture.role !== 'app_service' ||
          posture.rolsuper !== false || posture.rolbypassrls !== false || posture.enforcement !== 'on') {
        throw new Error('Catalogue native calls require the actual app_service/NOSUPERUSER/NOBYPASSRLS/RLS-on runtime.');
      }
      return await work(sqlClient);
    } finally {
      await sqlClient.release();
    }
  });
}

/** One new same-org workspace and one project for the newly created program.
 * Actual actor attribution and canonical defaults, with no sharing/grant override. */
export async function seedNativeCatalogProject(owner: Pool, input: {
  organizationId: number; userId: number; programId: string; namespace: string;
}): Promise<{ workspaceId: number; projectId: number }> {
  const expectedDatabase = decodeURIComponent(nativeOwnerTarget().pathname.slice(1));
  const ownerPosture = await owner.query<{ database: string }>('SELECT current_database() AS database');
  if (ownerPosture.rows.length !== 1 || ownerPosture.rows[0].database !== expectedDatabase) {
    throw new Error('The fixture owner must connect to the declared disposable native database.');
  }
  const workspace = await owner.query<{ id: number }>(
    `INSERT INTO client_workspaces (organization_id, name, slug, created_by_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.organizationId, `${input.namespace} workspace`, input.namespace, input.userId],
  );
  const workspaceId = workspace.rows[0].id;
  const project = await owner.query<{ id: number }>(
    `INSERT INTO projects
       (organization_id, client_workspace_id, name, type, owner_id, created_by_id, regulatory_program_id)
       VALUES ($1, $2, $3, 'regulatory', $4, $4, $5) RETURNING id`,
    [input.organizationId, workspaceId, `${input.namespace} project`, input.userId, input.programId],
  );
  return { workspaceId, projectId: project.rows[0].id };
}
