import express from 'express';
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
import type { PoolClient } from 'pg';
import { writeChainedAuditRow } from '../../services/auditService.js';
import { requireGovernedReason } from '../../routes/governed-reason';
import { inRefusableTransaction, isRefusal, refuse } from '../../services/vault/vault-refusal.js';
import { isApprovedSpecification } from '../../services/cmc/signed-record';

const router = express.Router();

// Validation schemas
const createSpecSchema = z.object({
  projectId: z.string().uuid().optional(),
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
      errorMap: () => ({
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
function buildSpecUpdate(data: Record<string, any>): { updates: string[]; values: any[] } {
  const fieldMap: Record<string, string> = {
    materialType: 'material_type',
    materialName: 'material_name',
    testParameters: 'test_parameters',
    acceptanceCriteria: 'acceptance_criteria',
    testMethods: 'test_methods',
    justification: 'justification',
    regulatoryBasis: 'regulatory_basis',
  };
  const updates: string[] = [];
  const values: any[] = [];
  for (const [key, col] of Object.entries(fieldMap)) {
    const val = data[key];
    if (val === undefined) continue;
    updates.push(`${col} = $${values.length + 1}`);
    values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
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
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;
    const pool = getPool();
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    // The audit row names the person who created the record; it used to name
    // 'system' for every create. The route sits behind the global /api auth
    // gate (register-platform-routes.ts), so a session user is always present
    // in production; NULL would mean "no actor resolved", never an invented one.
    const actorId = resolveActorUserId(req);

    const result = await pool.query(
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

    const spec = result.rows[0];

    // Log audit trail
    await pool.query(
      `INSERT INTO specification_audit_log (specification_id, action, changed_by, new_values)
       VALUES ($1, 'created', $2, $3)`,
      [spec.id, actorId ? String(actorId) : null, JSON.stringify(spec)]
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
        details: validationResult.error.errors,
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
 * Why a specification cannot be approved now, or null. Missing is 404. One
 * approval per revision: a second signature over a specification already
 * approved attested nothing new and stacked a second signature on the record;
 * a revision is an edit, which withdraws the approval first.
 */
function approvalTargetRefusal(spec: Record<string, unknown> | undefined): { status: number; body: Record<string, unknown> } | null {
  if (!spec) return { status: 404, body: { success: false, error: 'Specification not found' } };
  if (!isApprovedSpecification(spec)) return null;
  return {
    status: 409,
    body: {
      success: false,
      error: 'ALREADY_APPROVED',
      message: 'This specification is already approved. To revise it, edit it with a reason; that withdraws the approval, and the revision is approved again.',
    },
  };
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
      details: validationResult.error.errors,
    });
  }
  const { reason, meaning, reauth, idempotencyKey } = validationResult.data;

  // Number(), not parseInt: a malformed tenant ('7abc') is refused, not read as 7.
  const orgId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) {
    return res.status(401).json({ error: 'Tenant context required' });
  }
  const userId = resolveActorUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  // Signing authority (§11.10(g)), then the re-auth gate, before any write.
  // Until the P0-10b fix round only the password was checked, so a viewer
  // could approve.
  const authority = await checkSigningAuthority(userId, orgId);
  if (authority) return res.status(authority.status).json({ success: false, error: authority.code, message: authority.message });
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
    const notApprovable = approvalTargetRefusal(current.rows[0]);
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

// GET /api/cmc/specifications/:id/history - Audit trail for a specification
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const pool = getPool();


    const result = await pool.query(
      `SELECT sal.* FROM specification_audit_log sal
       JOIN quality_specifications qs ON qs.id = sal.specification_id
       WHERE sal.specification_id = $1 AND qs.tenant_id = $2
       ORDER BY sal.created_at DESC`,
      [id, tenantId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Specs] Error fetching specification history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch specification history',
      message: 'Operation failed',
    });
  }
});

export default router;
