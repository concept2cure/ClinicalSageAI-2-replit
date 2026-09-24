/**
 * The WO-03 two-tenant probe's domain list and its representative write/read
 * surface, used by two-tenant-application-rls.dbtest.ts. Not a test file:
 * vitest.db.config.ts collects `*.dbtest.ts` only, as with harness.ts.
 *
 * Moved out of that file on 2026-09-24, unchanged apart from taking its three
 * fixture values as arguments, when its governed-decisions cases took it past
 * the 500-line limit. The proof is still one contract in one test file; only
 * the route scaffolding it drives lives here.
 */
import express from 'express';
import { authenticateToken } from '../../server/middleware/auth';
import { requestPgClient } from '../../server/db/requestDb';

/**
 * The domains this probe proves isolation FOR. Everything outside this list is
 * asserted, not proven — that distinction is the whole status of WO-3, so the
 * list is the coverage number and adding to it is the work.
 *
 * Extended 2026-09-19 from three tables to six. The three added are regulated
 * stores, chosen because each carries the canonical `tenant_isolation_policy`
 * keyed on an integer `organization_id` (verified on the provisioned database,
 * not assumed) and each is read by a shipping surface:
 *
 *   design_controls  public.c2c_design_controls  21 CFR 820.30 design history
 *                    file — the DHF surface's only store
 *   risk_items       public.risk_items           ISO 14971 hazard analysis
 *
 * public.electronic_signatures was the third candidate and is DELIBERATELY NOT
 * here, which is worth writing down because it is the most consequential table
 * in the set. Its Part 11 trigger `esign_block_mutation()` refuses DELETE
 * outright — "rows cannot be deleted. Insert a superseding signature instead."
 * — and unlike audit_logs, whose immutability trigger provides the documented
 * `app.audit_archive_bypass` door this file's own cleanup uses, it provides no
 * door at all. So a fixture signature is permanent: every run would leak a row
 * pair, and `electronic_signatures.signer_id`'s FK to users then makes the
 * users cleanup fail with 23503 and leaks every fixture after it (observed,
 * which is how this was found). Covering it needs a fixture strategy that does
 * not require deletion — a dedicated signer whose rows are expected to
 * accumulate, or a superseding-insert cleanup — not a trigger-disable recipe
 * copied out of a test. Recorded for whoever owns Part 11.
 *
 * A table whose primary key is not `id` needs `idColumnFor` below; all six of
 * these key on `id`, so `submission_orchestrator_runs` (run_id) is the next
 * one to add and the reason that map exists.
 */
export type Domain = 'projects' | 'documents' | 'audit_logs' | 'design_controls' | 'risk_items';
export const domains: Domain[] = ['projects', 'documents', 'audit_logs', 'design_controls', 'risk_items'];
export const tableFor: Record<Domain, string> = {
  projects: 'public.projects',
  documents: 'public.documents',
  audit_logs: 'public.audit_logs',
  design_controls: 'public.c2c_design_controls',
  risk_items: 'public.risk_items',
};
/** The column the generic handlers address a row by. */
export const idColumnFor: Record<Domain, string> = {
  projects: 'id',
  documents: 'id',
  audit_logs: 'id',
  design_controls: 'id',
  risk_items: 'id',
};
/**
 * A non-key column the PATCH probe writes, per domain. Replaces an inline
 * ternary whose two `status` branches were identical, which made it read as a
 * per-domain decision when it was not.
 */
export const updateColumnFor: Record<Domain, string> = {
  projects: 'status',
  documents: 'status',
  audit_logs: 'action',
  design_controls: 'req',
  risk_items: 'status',
};

export function safeDomain(value: string): Domain | null {
  return domains.includes(value as Domain) ? (value as Domain) : null;
}

/**
 * The fixture values the POST (WITH CHECK) probe plants with: the other
 * tenant's workspace, the acting tenant-A user, and the run's tag.
 */
export interface ProofFixture {
  tag: string;
  foreignWorkspace: number;
  actingUser: number;
}

/** Mounts /proof/:domain on `app`, behind the production authenticateToken. */
export function mountTenantProofRoutes(app: express.Express, fixture: ProofFixture): void {
  app.use('/proof', authenticateToken);
  app.get('/proof/:domain', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    const q = String(req.query.q || '');
    const result = await requestPgClient(req).query(
      `SELECT ${idColumnFor[domain]}::text AS id FROM ${tableFor[domain]}
        WHERE ($1 = '' OR ${idColumnFor[domain]}::text = $1) ORDER BY 1`,
      [q]
    );
    return res.json({ ids: result.rows.map(r => r.id) });
  });
  // Register HEAD before GET. Express otherwise derives HEAD from GET and the
  // explicit existence-probe implementation would never execute.
  app.head('/proof/:domain/:id', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.sendStatus(404);
    const result = await requestPgClient(req).query(
      `SELECT 1 FROM ${tableFor[domain]} WHERE ${idColumnFor[domain]}::text=$1`,
      [req.params.id]
    );
    return res.sendStatus(result.rows.length ? 204 : 404);
  });
  app.get('/proof/:domain/:id', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    const result = await requestPgClient(req).query(
      `SELECT ${idColumnFor[domain]}::text AS id FROM ${tableFor[domain]} WHERE ${idColumnFor[domain]}::text=$1`,
      [req.params.id]
    );
    return result.rows.length
      ? res.json({ id: result.rows[0].id })
      : res.status(404).json({ error: { code: 'NOT_FOUND' } });
  });
  app.post('/proof/:domain', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    const foreignOrg = Number(req.body?.organizationId);
    try {
      if (domain === 'projects') {
        await requestPgClient(req).query(
          `INSERT INTO projects (organization_id,client_workspace_id,name,type,created_by_id)
           VALUES ($1,$2,$3,'regulatory',$4)`,
          [foreignOrg, fixture.foreignWorkspace, `${fixture.tag}-forged-project`, fixture.actingUser]
        );
      } else if (domain === 'documents') {
        await requestPgClient(req).query(
          `INSERT INTO documents
           (organization_id,client_workspace_id,document_code,title,document_type,owner_id,created_by_id)
           VALUES ($1,$2,$3,$4,'REGULATORY',$5,$5)`,
          [foreignOrg, fixture.foreignWorkspace, `${fixture.tag}-FORGED`, `${fixture.tag}-forged-document`, fixture.actingUser]
        );
      } else if (domain === 'audit_logs') {
        await requestPgClient(req).query(
          `INSERT INTO audit_logs (tenant_id,user_id,action,table_name,record_id)
           VALUES ($1,$2,'FORGED','wo03',$3)`,
          [foreignOrg, fixture.actingUser, `${fixture.tag}-forged-audit`]
        );
      } else if (domain === 'design_controls') {
        await requestPgClient(req).query(
          `INSERT INTO c2c_design_controls (id,organization_id,cat,req)
           VALUES ($1,$2,'performance','forged')`,
          [`${fixture.tag}-forged-dc`, foreignOrg]
        );
      } else {
        await requestPgClient(req).query(
          `INSERT INTO risk_items (organization_id,hazard,harm,severity,probability)
           VALUES ($1,$2,'forged',3,2)`,
          [foreignOrg, `${fixture.tag}-forged-hazard`]
        );
      }
      return res.sendStatus(201);
    } catch (error) {
      // Do not serialize the PostgreSQL error: it may contain schema or row
      // details. RLS WITH CHECK denial follows the same opaque contract as a
      // cross-tenant id probe.
      if ((error as { code?: string }).code === '42501') {
        return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      }
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
    }
  });
  app.patch('/proof/:domain/:id', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.sendStatus(404);
    const result = await requestPgClient(req).query(
      `UPDATE ${tableFor[domain]} SET ${updateColumnFor[domain]}=$1
         WHERE ${idColumnFor[domain]}::text=$2 RETURNING ${idColumnFor[domain]}`,
      ['TAMPERED', req.params.id]
    );
    return result.rows.length ? res.sendStatus(204) : res.sendStatus(404);
  });
  app.delete('/proof/:domain/:id', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.sendStatus(404);
    const result = await requestPgClient(req).query(
      `DELETE FROM ${tableFor[domain]} WHERE ${idColumnFor[domain]}::text=$1 RETURNING ${idColumnFor[domain]}`,
      [req.params.id]
    );
    return result.rows.length ? res.sendStatus(204) : res.sendStatus(404);
  });
}
