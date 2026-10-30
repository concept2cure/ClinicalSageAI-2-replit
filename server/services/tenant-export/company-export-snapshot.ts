import type { Pool, PoolClient } from 'pg';
import { runWithTenantScope } from '../../db/tenantStore';

/** The organization lock is shared with every canonical company writer. One
 * checked-out repeatable snapshot binds profile, registry and retained proofs;
 * a failed export never leaves an open transaction or lease behind. */
export async function companyExportSnapshot<T>(pool: Pool, organizationId: number,
  read: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query('SELECT id FROM organizations WHERE id=$1 FOR SHARE', [organizationId]);
    const result = await read(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/** The exported organization's identity has no uuid, so its own scope cannot be established. */
export class ExportScopeUnavailableError extends Error {
  constructor(organizationId: number) {
    super(`Organization ${organizationId} has no organization uuid, so its export cannot run in its own scope. No tenant data was returned.`);
    this.name = 'ExportScopeUnavailableError';
  }
}

/**
 * Run an export's read in the exported organization's own scope: its tenant id
 * and its organization uuid, and no role (P-58's data return, 2026-10-29;
 * docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/). The snapshot's connection
 * is checked out inside it, so the pool applies that scope to its transaction.
 *
 * Under the platform scope the export ran in until then (tenant '0', no
 * organization uuid), eight tables returned none of the organization's rows:
 * vault.documents, vault.document_catalog, vault.document_read_receipts and
 * vault.evidence_citations, whose policies decide through
 * identity.can_access_program on app.current_org_id, and citation_chains,
 * knowledge_graph_nodes, knowledge_graph_edges and lumen_knowledge_graph_edges,
 * whose policies read app.current_tenant_id alone
 * (docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-0/). Every policy admits
 * the organization's own rows in its own scope, so nothing is widened and no
 * door is needed; the export's own predicate still keeps every read to this
 * organization. A missing uuid refuses the export rather than return less.
 */
export async function inOrganizationScope<T>(pool: Pool, organizationId: number, caller: string,
  read: () => Promise<T>): Promise<T> {
  const { rows } = await pool.query('SELECT uuid::text AS uuid FROM organizations WHERE id = $1', [organizationId]);
  // No such organization: the read itself answers that (its not-found error), and it has no rows to lose.
  const orgUuid = rows.length === 0 ? null : rows[0].uuid ? String(rows[0].uuid) : '';
  if (orgUuid === '') throw new ExportScopeUnavailableError(organizationId);
  return runWithTenantScope({ tenantId: String(organizationId), orgUuid, role: null, source: 'request', caller }, read);
}
