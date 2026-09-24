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
 * Extended again 2026-09-24 (D3, docs/evidence/D3/2026-09-24-signatures-and-runs/)
 * with the two launch-catalog stores this list had left out:
 *
 *   signatures        public.electronic_signatures   21 CFR Part 11 §11.50/§11.70
 *                     — the most consequential table here: a cross-tenant read
 *                     is another company's signed approvals
 *   orchestrator_runs public.submission_orchestrator_runs  Submission Center —
 *                     every sequence build, keyed on run_id (not id), which is
 *                     why idColumnFor exists
 *
 * Signatures were excluded on 2026-09-19 for a reason that still holds and is
 * now designed around rather than worked around. `esign_block_mutation()`
 * refuses UPDATE and DELETE outright, with no archive door (unlike audit_logs'
 * `app.audit_archive_bypass`), so a signature fixture can never be removed, and
 * it pins its organization and its signer through foreign keys. So, in the
 * contract's beforeAll/afterAll:
 *
 *   - each fixture org has a PERMANENT signer (fixed email, NULL
 *     default_organization_id, so the users-by-org delete never reaches it);
 *   - each org has ONE fixture signature, looked up before it is inserted, so a
 *     database accumulates two rows in total, not two per run;
 *   - teardown no longer deletes the two reserved organization rows, which the
 *     signatures reference. They were already upserted on every run.
 *
 * Nothing disables the trigger, and nothing here could: §11.70 is enforced
 * against this probe exactly as it is against the product. A cross-tenant
 * UPDATE or DELETE still answers 404, and that is itself evidence about RLS: the
 * trigger is row-level, so it only fires on a row the statement can see. With
 * the policy hiding B's signature from A, A's DELETE matches zero rows and never
 * reaches the trigger; with the policy off, it reaches it and the answer is a
 * 500. The mutation runs filed with the change show both.
 */
export type Domain =
  | 'projects'
  | 'documents'
  | 'audit_logs'
  | 'design_controls'
  | 'risk_items'
  | 'signatures'
  | 'orchestrator_runs';
export const domains: Domain[] = [
  'projects',
  'documents',
  'audit_logs',
  'design_controls',
  'risk_items',
  'signatures',
  'orchestrator_runs',
];
export const tableFor: Record<Domain, string> = {
  projects: 'public.projects',
  documents: 'public.documents',
  audit_logs: 'public.audit_logs',
  design_controls: 'public.c2c_design_controls',
  risk_items: 'public.risk_items',
  signatures: 'public.electronic_signatures',
  orchestrator_runs: 'public.submission_orchestrator_runs',
};
/** The column the generic handlers address a row by. */
export const idColumnFor: Record<Domain, string> = {
  projects: 'id',
  documents: 'id',
  audit_logs: 'id',
  design_controls: 'id',
  risk_items: 'id',
  signatures: 'id',
  orchestrator_runs: 'run_id',
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
  // §11.70: the trigger refuses this for any row the statement can see.
  signatures: 'signature_purpose',
  // Not `status`: its CHECK would refuse 'TAMPERED' and mask the RLS result.
  orchestrator_runs: 'application_number',
};

export function safeDomain(value: string): Domain | null {
  return domains.includes(value as Domain) ? (value as Domain) : null;
}

/**
 * The fixture values the POST (WITH CHECK) probe plants with: the other
 * tenant's workspace, the acting tenant-A user, the run's tag, and tenant A's
 * permanent signer.
 */
export interface ProofFixture {
  tag: string;
  foreignWorkspace: number;
  actingUser: number;
  /**
   * The signatures forge signs as this user, not `actingUser`. If the policy
   * ever lets that forge through, the row it plants can never be deleted
   * (§11.70), and a per-run signer would then fail the teardown's users delete
   * on the signature's FK and strand every fixture after it.
   */
  permanentSigner: number;
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
      } else if (domain === 'risk_items') {
        await requestPgClient(req).query(
          `INSERT INTO risk_items (organization_id,hazard,harm,severity,probability)
           VALUES ($1,$2,'forged',3,2)`,
          [foreignOrg, `${fixture.tag}-forged-hazard`]
        );
      } else if (domain === 'signatures') {
        await requestPgClient(req).query(
          `INSERT INTO electronic_signatures
             (organization_id,signature_type,signature_purpose,signer_id,signer_name,signer_email,
              authentication_method,authentication_timestamp,signature_hash,signed_target)
           VALUES ($1,'approval','forged',$2,'forged',$3,'password',NOW(),$4,$5)`,
          [
            foreignOrg,
            fixture.permanentSigner,
            'wo03-fixture-signer-a@example.invalid',
            `${fixture.tag}-forged-signature`,
            `${fixture.tag}-forged-target`,
          ]
        );
      } else if (domain === 'orchestrator_runs') {
        await requestPgClient(req).query(
          `INSERT INTO submission_orchestrator_runs
             (run_id,organization_id,submission_id,application_number,region,submission_type,started_at,status)
           VALUES (gen_random_uuid(),$1,$2,'forged','US','IND',NOW(),'running')`,
          [foreignOrg, `${fixture.tag}-forged-submission`]
        );
      } else {
        /* This was a bare `else` that forged a RISK ITEM. A domain added to the
           list without its own branch would have planted into risk_items, been
           refused by risk_items' policy, answered 404 — and passed, for the
           wrong table. Shown happening on 2026-09-24 with signatures' RLS off
           (docs/evidence/D3/2026-09-24-signatures-and-runs/red/mutation-C-*).
           An unhandled domain now fails its test. */
        return res.status(500).json({ error: { code: 'UNHANDLED_DOMAIN' } });
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
