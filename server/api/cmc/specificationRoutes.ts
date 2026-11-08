import express, { type Request } from 'express';
import { getPool } from '../../db';
import { z } from 'zod';
import { writeThroughSpecification } from '../../services/cmc-write-through';
/* The one path from a register save to the Module 3 canonical layer: it awaits
   the write, reports { module3Linked, module3Warning } in the response and
   meters a failure. The program is the stored row's project_id, never the
   request body's, so no request is handed to it here. */
import { linkToModule3 } from '../../services/cmc/link-to-module3';
import { recordGovernedAction, verifyReauth } from '../../routes/c2c/actions';
import { BINDING_BASIS, persistGovernedActionSignature } from '../../services/part11/signature-persistence';
import { clientIpOf } from '../../utils/client-ip';
import { verifiedReauthFactors } from './cmc-signer';
import { checkSigningAuthority } from '../../services/part11/signing-authority-gate';
import { governedSignatureSchema, resolveActorUserId } from './governance';
/* The specification row, its history row and the record of WHO recorded it, on
   one pinned connection and one transaction (§11.10(e)). */
import { createOnConnection } from '../../services/cmc/register-audit';
import type { PoolClient } from 'pg';
import { writeChainedAuditRow } from '../../services/auditService.js';
import { requireGovernedReason } from '../../routes/governed-reason';
import { inRefusableTransaction, isRefusal, refuse } from '../../services/vault/vault-refusal.js';
import { isApprovedSpecification } from '../../services/cmc/signed-record';
import { loadProjectAnalyticalMethods, specificationMethodVerdict } from '../../services/cmc/analytical-method-source';
/* The specification register's history, read into the same shape the other
   sixteen registers' history is read into, so the product has one history
   panel (services/cmc/register-history.ts). */
import { MissingAuditStore, readSpecificationHistory } from '../../services/cmc/register-history';
import { setTenantContextTx } from '../../services/tenant/governed-tenant-context';
import { isUuid } from '../../middleware/uuidParam';

const router = express.Router();

// Validation schemas
const createSpecSchema = z.object({
  projectId: z.string().guid().optional(),
  materialType: z.string().min(1, 'Material type is required'),
  materialName: z.string().min(1, 'Material name is required'),
  testParameters: z.any().optional(),
  acceptanceCriteria: z.any().optional(),
  testMethods: z.any().optional(),
  justification: z.string().optional(),
  regulatoryBasis: z.any().optional(),
  /*
   * Only the unsigned states the client sends (cmcSpec.ts specCreateBody). This
   * was any string and the INSERT wrote it, so a create with 'approved' stored
   * an approved specification with no re-authentication, no ledger sign and no
   * signature row, and the write-through carried 'approved' into Module 3
   * (P0-10b fix round, DP-02). Approval is POST /:id/approve, and only there.
   */
  approvalStatus: z
    .enum(['draft', 'review'], {
      error: () => ({
        message: 'A specification is created as draft or review. Approval is an electronic signature: POST /api/cmc/specifications/:id/approve.',
      }),
    })
    .optional()
    .default('draft'),
});

const updateSpecSchema = z.object({
  materialType: z.string().optional(),
  materialName: z.string().optional(),
  testParameters: z.any().optional(),
  acceptanceCriteria: z.any().optional(),
  testMethods: z.any().optional(),
  justification: z.string().optional(),
  regulatoryBasis: z.any().optional(),
  approvalStatus: z.string().optional(),
  /** Required when the specification is approved: the edit withdraws that approval. */
  reason: z.string().optional(),
});

// Governed approval: high-risk e-signature. Approval can ONLY happen here, not
// via the ungoverned PUT path.
/* The signature meanings (21 CFR §11.50(a)(3)) and the governed-signature body
   both live in ./governance — one definition shared with every CMC surface that
   signs, so two surfaces can never disagree about what a signature is. */
const approveSpecSchema = governedSignatureSchema;


/**
 * The SET fragments and bound values of a specification update, in $1..$n order.
 *
 * approvalStatus is intentionally absent from the map: approval can ONLY happen
 * via the governed POST /:id/approve endpoint, never through the ungoverned PUT.
 */
/**
 * The columns this register writes, and which of them are `jsonb`.
 *
 * `test_parameters`, `acceptance_criteria`, `test_methods` and
 * `regulatory_basis` are jsonb; `material_type`, `material_name` and
 * `justification` are text. The distinction is not cosmetic — see below.
 */
const SPEC_COLUMNS: Record<string, { column: string; json: boolean }> = {
  materialType: { column: 'material_type', json: false },
  materialName: { column: 'material_name', json: false },
  testParameters: { column: 'test_parameters', json: true },
  acceptanceCriteria: { column: 'acceptance_criteria', json: true },
  testMethods: { column: 'test_methods', json: true },
  justification: { column: 'justification', json: false },
  regulatoryBasis: { column: 'regulatory_basis', json: true },
};

/**
 * The SET clause for an edit.
 *
 * ── The asymmetry this fixes (2026-10-25) ────────────────────────────────────
 * This encoded a value only when it was an OBJECT:
 *
 *     values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
 *
 * while the create, three screens away in the same file, encodes the four jsonb
 * columns unconditionally. So a caller that sends a plain string for one of
 * them could CREATE a specification and then not EDIT it: the new value reached
 * a jsonb column as raw text, Postgres answered 22P02 (`Token "-" is
 * invalid`), and the route returned `500 Failed to update specification ·
 * Operation failed`.
 *
 * ── Who that caller is, stated precisely ─────────────────────────────────────
 * NOT the Specifications tab. `specUpdateBody` always sends
 * `{release, shelf}`, `{method}` and `{ich}` objects, so the form took the
 * object branch and worked. (What WAS broken from the tab is a different
 * defect, fixed in the same change: `CmcSpecRow.id` was typed `number` and
 * `Number()` of a uuid is NaN, so Edit, Approve and History all addressed
 * `/api/cmc/specifications/NaN`.) This branch is reached by any other caller
 * of the same route — an AnA tool, a script, an integration — and it is those
 * that could create a row they could not then edit.
 *
 * The encoding now follows the COLUMN, as the create does, so the two agree.
 * A scalar persisted this way is also now READ rather than rendered as a blank
 * limit (`specRowFromApi`'s `scalar`, client/src/.../cmcSpec.ts): a 500 that
 * becomes a silently empty acceptance criterion would be a worse trade than the
 * 500 was. Covered by `__tests__/specification-update-encoding.test.ts`.
 *
 * So the encoding follows the COLUMN, not the value's JavaScript type, exactly
 * as the create does. `justification` stays text and is never encoded — doing
 * that would store a quoted string and show the quotes to the next reader.
 */
function buildSpecUpdate(data: Record<string, any>): { updates: string[]; values: any[] } {
  const updates: string[] = [];
  const values: any[] = [];
  for (const [key, { column, json }] of Object.entries(SPEC_COLUMNS)) {
    const val = data[key];
    if (val === undefined) continue;
    updates.push(`${column} = $${values.length + 1}`);
    values.push(json ? JSON.stringify(val ?? null) : val);
  }
  return { updates, values };
}

// GET /api/cmc/specifications/:projectId - List specs for a project
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const pool = getPool();


    /* Strictly the caller's tenant. `OR tenant_id IS NULL` used to sit here and
       made every unattributed row readable — and, through the PUT below,
       writable — by every organization. Nothing in this product creates a
       global specification (the INSERT below always stamps the caller behind a
       401), so the clause bought nothing; the NULL rows it exposed are the
       legacy ones db/migrations/20260401_cmc_convergence_os.sql left behind
       when it added tenant_id to an already-populated table. Same rationale
       server/routes/part11-compliance.ts:479-486 records for dropping its own
       unattributed-row disjunct: the application scope must not be looser than
       the RLS policy behind it, and that policy excludes NULL. */
    const result = await pool.query(
      `SELECT * FROM quality_specifications
       WHERE project_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [projectId, tenantId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Specs] Error fetching specifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch specifications',
      message: 'Operation failed',
    });
  }
});

// POST /api/cmc/specifications - Create specification
router.post('/', async (req, res) => {
  try {
    const validationResult = createSpecSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validationResult.error.issues,
      });
    }

    const data = validationResult.data;
    const pool = getPool();
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    // The person who created the record; it used to name 'system' for every
    // create. The route sits behind the global /api auth gate
    // (register-platform-routes.ts), so a session user is always present in
    // production. A create that resolves nobody is now refused rather than
    // recorded with a NULL operator: §11.10(e) asks for the operator on every
    // entry that creates a record (services/cmc/register-audit.ts).
    const actorId = resolveActorUserId(req);

    /* The specification, its own history row and the §11.10(e) chained record
       of who recorded it, on ONE pinned connection and one transaction.
       Until this change the two writes were separate `pool.query` calls on
       whatever connection the pool handed back, so a failure between them left
       a specification with no history row — and the chain, which is the trail
       an inspector reads across every register, carried no row for a
       specification create at all. `specification_audit_log` stays: it is this
       register's own version history, which the specification screen reads,
       and it answers a different question (what changed) from the chain's (who
       entered what, tamper-evidently). */
    const spec = await createOnConnection(
      pool,
      {
        organizationId: Number(tenantId),
        actor: { userId: actorId },
        register: 'specification',
        table: 'quality_specifications',
      },
      async (client) => {
        const result = await client.query(
          `INSERT INTO quality_specifications (
            project_id, tenant_id, material_type, material_name,
            test_parameters, acceptance_criteria, test_methods,
            justification, regulatory_basis, approval_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *`,
          [
            data.projectId || null,
            tenantId,
            data.materialType,
            data.materialName,
            JSON.stringify(data.testParameters || null),
            JSON.stringify(data.acceptanceCriteria || null),
            JSON.stringify(data.testMethods || null),
            data.justification || null,
            JSON.stringify(data.regulatoryBasis || null),
            data.approvalStatus,
          ]
        );
        const row = result.rows[0] as { id: number | string };
        await client.query(
          `INSERT INTO specification_audit_log (specification_id, action, changed_by, new_values)
           VALUES ($1, 'created', $2, $3)`,
          [row.id, actorId ? String(actorId) : null, JSON.stringify(row)]
        );
        return row;
      },
    );

    console.log(`[CMC Specs] Created specification ${spec.id} for ${data.materialName}`);
    const linkage = await linkToModule3('write_through_specification', Number(tenantId), spec, writeThroughSpecification);

    res.status(201).json({
      success: true,
      data: spec,
      message: 'Specification created successfully',
      timestamp: new Date().toISOString(),
      ...linkage,
    });
  } catch (error) {
    console.error('[CMC Specs] Error creating specification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create specification',
      message: 'Operation failed',
    });
  }
});

// PUT /api/cmc/specifications/:id - Update specification
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validationResult = updateSpecSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validationResult.error.issues,
      });
    }

    const data = validationResult.data;
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    /* The audit row names the person from the SESSION. It used to take
       `changedBy` from the request body and fall back to 'system', so every
       edit from the board (which never sent it) was attributed to 'system',
       and any caller could name someone else. */
    const actorId = resolveActorUserId(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'AUTH_REQUIRED' });
    }

    // Build dynamic update
    const { updates, values } = buildSpecUpdate(data);
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    const out = await inRefusableTransaction(async (client: PoolClient) => {
      // Strict tenant scope (see the GET above), locked for the edit.
      const currentResult = await client.query(
        `SELECT * FROM quality_specifications WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId]
      );
      const currentSpec = currentResult.rows[0];
      if (!currentSpec) return refuse(404, 'NOT_FOUND', 'Specification not found');

      /* Editing an APPROVED specification withdraws its approval
         (services/cmc/signed-record). The signature binds the ledger hash, not
         the criteria, so an edit that kept 'approved' left the signature on
         limits nobody signed. The edit needs a governed reason; the record
         returns to draft and is approved again through POST /:id/approve. */
      const withdrawing = isApprovedSpecification(currentSpec);
      let reason: string | null = null;
      if (withdrawing) {
        const verdict = requireGovernedReason(data.reason);
        if (!verdict.ok) {
          return refuse(422, 'REASON_REQUIRED',
            `This specification is approved. Changing it withdraws the approval, so a reason is required: ${verdict.error}`);
        }
        reason = verdict.reason;
      }

      /* The write carries its OWN tenant predicate rather than inheriting
         whatever the read above admitted. */
      const sets = withdrawing ? [...updates, `approval_status = 'draft'`] : updates;
      const idParam = values.length + 1;
      const updateResult = await client.query(
        `UPDATE quality_specifications
            SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${idParam} AND tenant_id = $${idParam + 1}
          RETURNING *`,
        [...values, id, tenantId]
      );
      const updatedSpec = updateResult.rows[0];
      // Fail closed: an empty result is never rendered as a success.
      if (!updatedSpec) return refuse(404, 'NOT_FOUND', 'Specification not found');

      await client.query(
        `INSERT INTO specification_audit_log (specification_id, action, changed_by, previous_values, new_values)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, withdrawing ? 'approval_withdrawn' : 'updated', String(actorId), JSON.stringify(currentSpec), JSON.stringify(updatedSpec)]
      );
      if (withdrawing) {
        await writeChainedAuditRow(client, {
          tenantId: Number(tenantId),
          userId: actorId,
          action: 'cmc.specification.approval_withdrawn',
          resourceType: 'quality_specification',
          resourceId: String(id),
          ipAddress: clientIpOf(req) ?? undefined,
          userAgent: req.headers['user-agent'],
          details: { projectId: currentSpec.project_id ?? null, from: 'approved', to: 'draft', reason },
        });
      }
      return { updatedSpec, withdrawing };
    });
    if (isRefusal(out)) {
      return res.status(out.status).json({
        success: false, error: out.code, message: out.message,
        ...(out.code === 'REASON_REQUIRED' ? { field: 'reason' } : {}),
      });
    }
    const { updatedSpec, withdrawing } = out;

    console.log(`[CMC Specs] Updated specification ${id}`);
    const linkage = await linkToModule3('write_through_specification', Number(tenantId), updatedSpec, writeThroughSpecification);

    res.json({
      success: true,
      data: updatedSpec,
      message: withdrawing
        ? 'Specification updated. Its approval was withdrawn: approve it again before it is filed.'
        : 'Specification updated successfully',
      approvalWithdrawn: withdrawing,
      timestamp: new Date().toISOString(),
      ...linkage,
    });
  } catch (error) {
    console.error('[CMC Specs] Error updating specification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update specification',
      message: 'Operation failed',
    });
  }
});

/** No content basis is registered for a specification, and none is claimed (signature-persistence BINDING_BASIS). */
const LEDGER_BINDING_NOTE =
  'No content digest is registered for a quality specification, so none is claimed: bound_payload_digest is the governed action audit sha256 chain hash (target, payload hash, actor, time), not a content hash.';

/**
 * Why a specification cannot be approved now, or null. Missing is 404.
 *
 * One approval per revision: a second signature over a specification already
 * approved attested nothing new and stacked a second signature on the record;
 * a revision is an edit, which withdraws the approval first.
 *
 * And ICH Q2 — a limit is approved only with a procedure fit to measure it.
 * The Specifications tab has stated this in two places since the tab was
 * written and nothing enforced it, so any caller that was not the form (an AnA
 * tool, a script, curl) approved freely; the form's own check was `!method`
 * ("no name typed"), which a method still in `development` passes.
 * `specificationMethodVerdict` refuses only what it KNOWS is unfit — its
 * header says why an unreadable register and an unrecorded status are not
 * refusals. The method register is read on the POOL rather than the caller's
 * transaction: it is a precondition on another table, and the specification
 * row is already locked FOR UPDATE by the time this is asked.
 */
/**
 * The analytical method this specification names, from `test_methods`.
 *
 * The column is jsonb and this register writes `{ method }`; a caller that is
 * not the form may have persisted a bare string. Both are read, exactly as the
 * client's `specRowFromApi` reads them, so the screen and the gate resolve the
 * same name.
 */
function methodNameOf(spec: Record<string, unknown> | undefined): string {
  const raw = spec?.test_methods;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const m = (raw as Record<string, unknown>).method;
    return typeof m === 'string' ? m : '';
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return '';
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const m = (parsed as Record<string, unknown>).method;
        return typeof m === 'string' ? m : '';
      }
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return t;
    }
  }
  return '';
}

/**
 * ICH Q2: a limit is approved only with a procedure fit to measure it.
 *
 * The Specifications tab has stated this in two places since the tab was
 * written and nothing enforced it, so any caller that was not the form — an
 * AnA tool, a script, curl — approved freely; and the form's own check was
 * `!method` ("no name typed"), which a method still in `development` passes.
 *
 * `specificationMethodVerdict` refuses only what it KNOWS is unfit — its
 * header says why an unreadable register and an unrecorded status are not
 * refusals. The method register is read on the POOL rather than the caller's
 * transaction: it is a precondition on another table, and the specification
 * row is already locked FOR UPDATE by then.
 */
async function approvalTargetRefusal(
  spec: Record<string, unknown> | undefined,
  orgId: number,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  if (!spec) return { status: 404, body: { success: false, error: 'Specification not found' } };
  if (isApprovedSpecification(spec)) {
    return {
      status: 409,
      body: {
        success: false,
        error: 'ALREADY_APPROVED',
        message: 'This specification is already approved. To revise it, edit it with a reason; that withdraws the approval, and the revision is approved again.',
      },
    };
  }
  const verdict = specificationMethodVerdict(
    methodNameOf(spec),
    await loadProjectAnalyticalMethods(getPool(), orgId, String(spec.project_id ?? '')),
  );
  if (verdict.approve) return null;
  return { status: 409, body: { success: false, error: verdict.code, message: verdict.message } };
}

/**
 * Whether this specification is approvable AT ALL, asked before the signer is
 * asked for their password.
 *
 * Nobody signs into a refusal. A limit whose analytical method is unfit, or
 * one already approved, is turned away without anyone typing their password
 * over an act that was never going to complete — which is why this read sits
 * ahead of the re-authentication rather than inside the transaction alone.
 *
 * This read is not the authority. The same question is asked again under
 * FOR UPDATE, and that second answer is the one the write commits against;
 * this one only decides whether to ask for a password.
 *
 * Both ceremony calls — `checkSigningAuthority` and `verifyReauth` — stay IN
 * the handler, beside the signed write, and only this approvability read is
 * extracted. `ci:sign-ceremony` reads both there, and it is right to: a
 * ceremony folded behind a helper is how a later edit removes one without
 * anybody seeing it go.
 */
async function approvalApprovabilityRefusal(
  id: string,
  orgId: number,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const preflight = await getPool().query(
    `SELECT * FROM quality_specifications WHERE id = $1 AND tenant_id = $2`,
    [id, orgId],
  );
  return approvalTargetRefusal(preflight.rows[0], orgId);
}

/**
 * The tenant a signature is attributed to, or null when none is attached.
 *
 * Number(), not parseInt: a malformed tenant ('7abc') is refused, not read as
 * 7. `resolveOrgId` (server/types/auth-request) parses a string tenant with
 * parseInt, which reads that as tenant 7 — so the signing path keeps its own
 * stricter reading rather than widening the shared one beneath a signature.
 * (The three read routes above hold the raw value unconverted; converging them
 * onto this changes what reaches `tenant_id` in their SQL, so it is its own
 * change, not a rider on a signature fix.)
 */
function signingTenantOf(req: Request): number | null {
  const orgId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
  return Number.isFinite(orgId) && orgId > 0 ? orgId : null;
}

// POST /api/cmc/specifications/:id/approve - Governed e-signature approval
// (high-risk sign). The ONLY path to approval; routed through the
// mutation-primitives ledger (audit_logs + c2c_ana_actions).
router.post('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const validationResult = approveSpecSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid input data',
      details: validationResult.error.issues,
    });
  }
  const { reason, meaning, reauth, idempotencyKey } = validationResult.data;

  const orgId = signingTenantOf(req);
  if (!orgId) {
    return res.status(401).json({ error: 'Tenant context required' });
  }
  const userId = resolveActorUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  // Signing authority (§11.10(g)) before the password: until P0-10b only the
  // password was checked, so a viewer could approve.
  const authority = await checkSigningAuthority(userId, orgId);
  if (authority) {
    return res.status(authority.status).json({ success: false, error: authority.code, message: authority.message });
  }

  // Then whether this limit can be approved at all — before the password, so
  // nobody re-authenticates into a refusal.
  const blocked = await approvalApprovabilityRefusal(id, orgId);
  if (blocked) return res.status(blocked.status).json(blocked.body);

  // The re-auth gate, beside the write it authorises (§11.10, ci:sign-ceremony).
  const reauthResult = await verifyReauth(userId, reauth);
  if (!reauthResult.ok) {
    res.setHeader('WWW-Authenticate', 'ReAuth required');
    return res.status(401).json({ error: reauthResult.error ?? 'REAUTH_REQUIRED' });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify the spec exists for this tenant, locked for the signature.
    const current = await client.query(
      `SELECT * FROM quality_specifications WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, orgId],
    );
    const notApprovable = await approvalTargetRefusal(current.rows[0], orgId);
    if (notApprovable) {
      await client.query('ROLLBACK');
      return res.status(notApprovable.status).json(notApprovable.body);
    }

    const updateResult = await client.query(
      `UPDATE quality_specifications
       SET approval_status = 'approved', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, orgId],
    );
    const updatedSpec = updateResult.rows[0];
    // Fail closed on an UPDATE that matched nothing. The existence SELECT above
    // is not a lock: a concurrent delete (or a tenant re-key) between the two
    // statements leaves `rows` empty, and the code below would still COMMIT — a
    // governed e-signature and a specification_audit_log row with
    // `new_values: null`, attesting an approval of a record that is not there,
    // returned to the caller as a 200 with no data. A 21 CFR 11 signature
    // manifestation over a nonexistent record is a falsified one.
    if (!updatedSpec) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Specification not found' });
    }

    const governance = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'sign',
      target: `specification:${id}`,
      reason,
      // The signer's own meaning, not a constant. It was collected by the
      // signature form and thrown away here, so every signature was recorded as
      // "approval" whatever the signer selected.
      payload: { meaning },
      domain: 'biopharma',
      surface: 'cmc-specifications',
      idempotencyKey: idempotencyKey ?? null,
    });

    // 21 CFR Part 11 signature row, same transaction as the ledger pair; none
    // was written until 2026-10-01 (P0-10b, DP-02).
    await persistGovernedActionSignature(client, {
      orgId, userId, target: `specification:${id}`, reason, payload: { meaning },
      actionId: governance.actionId, auditId: governance.auditId, sha256Chain: governance.sha256Chain,
      ...verifiedReauthFactors(reauth), ipAddress: clientIpOf(req), occurredAt: new Date(),
      binding: { digest: null, basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER, note: LEDGER_BINDING_NOTE },
      complianceStatement: 'Specification approval applied under 21 CFR Part 11 §11.50/§11.70/§11.200; ledger-chained to the audit_logs sha256 chain.',
    });

    // Keep the existing specification_audit_log trail.
    await client.query(
      `INSERT INTO specification_audit_log (specification_id, action, changed_by, previous_values, new_values)
       VALUES ($1, 'approved', $2, $3, $4)`,
      [id, String(userId), JSON.stringify(current.rows[0]), JSON.stringify(updatedSpec)],
    );

    await client.query('COMMIT');

    /* The approval is committed under its signature above; whether it reached
       the dossier layer is reported, never assumed. */
    const linkage = await linkToModule3('write_through_specification', orgId, updatedSpec, writeThroughSpecification);

    return res.json({
      success: true,
      data: updatedSpec,
      governance: { actionId: governance.actionId, sha256Chain: governance.sha256Chain },
      timestamp: new Date().toISOString(),
      ...linkage,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    console.error('[CMC Specs] Error approving specification:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to approve specification',
      message: 'Operation failed',
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/cmc/specifications/:id/history — every recorded change to one
 * specification, oldest first, each with the fields that moved and both values.
 *
 * ── What changed on 2026-10-25, and why ─────────────────────────────────────
 * The route is as old as the register and NO screen in the product had ever
 * called it (measured: a reachability sweep over all 99 CMC routes against
 * every client source file). So the one register an inspector asks about first
 * — the limits a batch is released against — was the only register whose
 * changes could not be read in the product, while the other sixteen gained the
 * §11.10(e) panel on 2026-10-18.
 *
 * It answered `{ data: specification_audit_log rows }`: raw snapshots, the
 * actor as a bare id string, and no diff. Reaching it from the existing panel
 * would have meant a second payload shape and a second mapper in the client —
 * two history UIs, drifting. It now answers the SAME envelope as
 * `GET /api/cmc/register-history/:register/:id`, with `store` naming which
 * store answered, so one panel renders both and neither is rebuilt.
 *
 * Changing the shape breaks no caller, because it had none.
 *
 * Fail closed, as the chain reader does: a store that cannot be read is 503
 * and never an empty history, and another tenant's specification is a 404 —
 * that it exists is not this caller's to learn.
 */
router.get('/:id/history', async (req, res) => {
  const { id } = req.params;
  const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  if (!tenantId) {
    return res.status(403).json({ success: false, error: 'Tenant context required' });
  }
  const orgId = Number(tenantId);
  /* A malformed id is a bad request, not a server failure. `id` goes into a
     uuid column, so anything else raises 22P02 and reached the client as a 500
     the user read as "Operation failed" — the same shape of mistake the
     register's own NaN ids made, and the one this panel exists to make
     visible. 404, like any other id this tenant does not hold. */
  if (!isUuid(id)) {
    return res.status(404).json({ success: false, error: 'No such specification in this organization.' });
  }
  let client: PoolClient | undefined;
  try {
    client = await getPool().connect();
    await client.query('BEGIN');
    /* `public.actor_name` resolves a name only within the calling scope's
       organisation, so the tenant GUC must be set before the read or every
       act reads as an unnamed account. */
    await setTenantContextTx(client, orgId);
    const owned = await client.query(
      'SELECT 1 AS present FROM quality_specifications WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [id, orgId],
    );
    /* `rows.length`, never `rowCount`: the driver the route tests run against
       does not set `rowCount` on a SELECT, so `rowCount === 0` was false for a
       row that IS there and `=== 0` was never true for one that is not — the
       owning tenant read 404 for its own specification, and the contract test
       (tests/schema-contract/cmc-specification-tenant-scope.contract.test.ts)
       caught it. `rows` is what every driver fills. */
    if (owned.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'No such specification in this organization.' });
    }
    const history = await readSpecificationHistory(client, { orgId, specificationId: id });
    await client.query('COMMIT');
    return res.json({
      success: true,
      data: {
        register: 'specification',
        recordId: id,
        store: history.store,
        entries: history.entries,
        earlierActsNotShown: history.earlierActsNotShown,
        note:
          history.entries.length === 0
            ? 'No change is recorded against this specification. Its revision log begins when the ' +
              'specification was first recorded here; one imported from another system carries no earlier history.'
            : null,
      },
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof MissingAuditStore) {
      return res.status(503).json({ success: false, error: 'AUDIT_TABLE_MISSING' });
    }
    console.error('[CMC Specs] Error fetching specification history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch specification history',
      message: 'Operation failed',
    });
  } finally {
    client?.release();
  }
});

export default router;
