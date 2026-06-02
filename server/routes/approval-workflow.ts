/**
 * Approval Workflow API Routes
 *
 * Full CRUD for approval workflows:
 *   POST   /api/approval-workflows/start              Start a workflow on a document
 *   POST   /api/approval-workflows/:id/approve         Approve current step
 *   POST   /api/approval-workflows/:id/reject          Reject at current step
 *   POST   /api/approval-workflows/:id/delegate        Delegate to another user
 *   GET    /api/approval-workflows/pending              Get pending approvals for current user
 *   GET    /api/approval-workflows/:workflowId/status   Full workflow status + history
 *   GET    /api/approval-workflows/templates            List available workflow templates
 *
 * @module server/routes/approval-workflow
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { approvalOrchestrator } from '../services/workflow/ApprovalOrchestrator';
import { db, pool } from '../db';
// pool is used for the raw INSERT into electronic_signatures (the table has
// no Drizzle schema in this codebase; routes/esignature.ts uses the same
// raw-SQL pattern, and the table is not in the tenant-isolation scanner's
// list of tenant-scoped tables).
import { eq, and } from 'drizzle-orm';
import {
  workflowTemplates,
  workflowSteps,
  workflowApprovals,
  documentWorkflows,
  unifiedDocuments,
  workflowDocumentVersions,
} from '../../shared/schema/unified_workflow';
import { users } from '../../shared/schema';
import auditService from '../services/auditService';
import { verifyToken as verifyMfaToken } from '../services/mfaService';

import { createScopedLogger } from '../utils/logger.js';
import { verifyJwtWithRotation } from '../utils/jwtVerify.js';

const logger = createScopedLogger('approval-workflow');

const router = Router();

const isDev = process.env.NODE_ENV === 'development';

// ── Auth helper ────────────────────────────────────────────────────────────

function getUser(req: Request): { userId: string; organizationId: string } | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (isDev && !token) {
    return { userId: '1', organizationId: '2' };
  }

  if (!token) return null;

  try {
    const decoded = verifyJwtWithRotation(token) as {
      userId: string;
      organizationId?: string;
    };
    return {
      userId: decoded.userId,
      organizationId: decoded.organizationId,
    };
  } catch {
    return null;
  }
}

function requireAuth(req: Request, res: Response): { userId: string; organizationId: string } | null {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}

// ============================================================================
// POST /api/approval-workflows/start — Start a new workflow
// ============================================================================

router.post('/start', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { documentId, templateId, metadata } = req.body;

    if (!documentId || !templateId) {
      return res.status(400).json({
        error: 'documentId and templateId are required',
      });
    }

    const result = await approvalOrchestrator.startWorkflow({
      documentId,
      templateId,
      startedBy: user.userId,
      organizationId: user.organizationId,
      metadata,
    });

    return res.status(201).json({
      success: true,
      workflowId: result.workflowId,
      approvalIds: result.approvals,
      message: 'Workflow started successfully',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Start error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(400).json({ error: message });
  }
});

// ============================================================================
// POST /api/approval-workflows/:id/approve — Approve current step
//
// Two modes:
//   1. Comments-only (legacy)   — body: { comments } → advances the step.
//   2. 21 CFR Part 11 e-sign    — body: { meaning, signaturePassword,
//      mfaToken } → verifies BOTH factors server-side, advances the step,
//      then writes an electronic_signatures row + audit event. Single POST
//      to keep the kit's "Apply signature" action atomic from the user's
//      perspective.
//
// Auth strength: password + TOTP (authentication_method='password+totp'),
// matching /api/esignature/sign's ceremony. /verify-mfa is NOT called as a
// separate step — the TOTP is sent in the same request and verified inline,
// which eliminates the trust-the-client gap of a pre-verified flag.
//
// version_id semantics: resolves the workflow_document_versions row for
// (documentId, latestVersion). Auto-creates one if missing so every
// signature has a stable FK anchor.
// ============================================================================

router.post('/:id/approve', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const approvalId = parseInt(req.params.id);
    const {
      comments,
      meaning,
      signaturePassword,
      mfaToken,
    } = req.body ?? {};

    const isPartEleven =
      typeof meaning === 'string' && meaning.trim().length > 0 &&
      typeof signaturePassword === 'string' && signaturePassword.length > 0;

    // 1 — verify BOTH factors BEFORE any state change.
    //     A signature whose credentials failed must not advance the workflow.
    const numericUserId = Number(user.userId);
    if (isPartEleven) {
      if (!Number.isFinite(numericUserId)) {
        return res.status(401).json({ error: 'AUTH_REQUIRED' });
      }
      if (typeof mfaToken !== 'string' || !/^\d{6}$/.test(mfaToken)) {
        return res.status(400).json({ error: 'MFA_TOKEN_REQUIRED' });
      }
      const hash = await loadPasswordHash(numericUserId);
      if (!hash) {
        return res.status(401).json({ error: 'SIGNATURE_INVALID' });
      }
      const pwdOk = await bcrypt
        .compare(signaturePassword, hash)
        .catch(() => false);
      if (!pwdOk) {
        return res.status(401).json({ error: 'SIGNATURE_INVALID' });
      }
      const mfaOk = await verifyMfaToken(numericUserId, mfaToken).catch(() => false);
      if (!mfaOk) {
        return res.status(401).json({ error: 'MFA_INVALID' });
      }
    }

    // 2 — advance the workflow step (existing orchestrator path).
    const result = await approvalOrchestrator.processApproval({
      approvalId,
      action: 'approve',
      performedBy: user.userId,
      comments: isPartEleven ? meaning : comments,
    });

    // 3 — Part 11: record the signature row + audit event. Best-effort
    //     after step advance; on failure we log critical and surface
    //     `signaturePending: true` so the client can surface reconciliation.
    let signatureId: number | null = null;
    let signaturePending = false;
    if (isPartEleven) {
      try {
        signatureId = await recordApprovalSignature({
          approvalId,
          userId: numericUserId,
          meaning,
          req,
        });
      } catch (sigErr) {
        signaturePending = true;
        logger.error('Part 11 signature row write failed after step advance', {
          approvalId,
          err: sigErr instanceof Error ? sigErr.message : String(sigErr),
        });
      }
    }

    return res.json({
      success: true,
      ...result,
      ...(isPartEleven
        ? { signatureId, signaturePending, authenticationMethod: 'password+totp' }
        : {}),
      message: result.workflowCompleted
        ? 'Workflow completed — all steps approved'
        : result.workflowAdvanced
        ? `Step approved. Advanced to step ${result.nextStep}`
        : 'Step approved',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Approve error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(400).json({ error: message });
  }
});

// ── Part 11 helpers (approval-workflow signature path) ─────────────────────
//
// loadPasswordHash + recordApprovalSignature mirror the patterns in
// `routes/esignature.ts` but with the policy decisions specific to the
// approval-workflow surface: password-only authentication, version anchor
// from unified_documents.latestVersion, manifest JSON keyed on approvalId.
//
// Both use raw SQL against `users` and `electronic_signatures` because those
// are the tables `routes/esignature.ts` already uses; `electronic_signatures`
// has no Drizzle schema in this codebase.

async function loadPasswordHash(userId: number): Promise<string | null> {
  try {
    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.passwordHash ?? null;
  } catch (err: any) {
    if (err?.code !== '42P01') {
      logger.warn('password lookup failed', { err: err?.message });
    }
    return null;
  }
}

interface RecordSignatureParams {
  approvalId: number;
  userId: number;
  meaning: string;
  req: Request;
}

async function recordApprovalSignature(
  params: RecordSignatureParams,
): Promise<number> {
  const { approvalId, userId, meaning, req } = params;

  // Resolve workflow + document so the signature row points at the right
  // document_id and we can derive a version anchor.
  const [approval] = await db
    .select()
    .from(workflowApprovals)
    .where(eq(workflowApprovals.id, approvalId));
  if (!approval) throw new Error(`approval ${approvalId} not found`);

  const [workflow] = await db
    .select()
    .from(documentWorkflows)
    .where(eq(documentWorkflows.id, approval.workflowId));
  if (!workflow) throw new Error(`workflow ${approval.workflowId} not found`);

  const [step] = await db
    .select({ name: workflowSteps.name })
    .from(workflowSteps)
    .where(eq(workflowSteps.id, approval.stepId));

  // Resolve workflow_document_versions.id for (documentId, latestVersion).
  // Auto-create the row if missing so every signature has a stable FK anchor;
  // the document's latestVersion number is preserved in the manifest.
  const [doc] = await db
    .select({ latestVersion: unifiedDocuments.latestVersion })
    .from(unifiedDocuments)
    .where(eq(unifiedDocuments.id, workflow.documentId));
  const latestVersionNumber = doc?.latestVersion ?? 1;

  const [existingVersion] = await db
    .select({ id: workflowDocumentVersions.id })
    .from(workflowDocumentVersions)
    .where(
      and(
        eq(workflowDocumentVersions.documentId, workflow.documentId),
        eq(workflowDocumentVersions.version, latestVersionNumber),
      ),
    )
    .limit(1);

  let versionRowId: number;
  if (existingVersion) {
    versionRowId = existingVersion.id;
  } else {
    const [created] = await db
      .insert(workflowDocumentVersions)
      .values({
        documentId: workflow.documentId,
        version: latestVersionNumber,
        createdBy: String(userId),
        comments: 'auto-created by approval e-signature',
      })
      .returning({ id: workflowDocumentVersions.id });
    versionRowId = created.id;
  }

  // Signer identity — denormalised onto the row for offline audit.
  const sessionUser = (req as any).user ?? {};
  let signerName: string = sessionUser.name ?? '';
  let signerEmail: string = sessionUser.email ?? '';
  try {
    const [row] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (row) {
      signerName = signerName || row.name || '';
      signerEmail = signerEmail || row.email || '';
    }
  } catch (err: any) {
    if (err?.code !== '42P01') {
      logger.warn('signer lookup failed', { err: err?.message });
    }
  }
  if (!signerEmail) {
    throw new Error('signer email not resolvable from session');
  }

  const signedAt = new Date();
  const ipAddress =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    (req as any).socket?.remoteAddress ||
    null;

  // Deterministic content hash — the bytes a regulator would re-derive.
  // Does NOT include the password or MFA token.
  const signatureHash = createHash('sha256')
    .update(
      JSON.stringify({
        approvalId,
        workflowId: workflow.id,
        documentId: workflow.documentId,
        versionId: versionRowId,
        documentVersionNumber: latestVersionNumber,
        stepOrder: approval.stepOrder,
        meaning,
        action: 'approve',
        signerId: userId,
        signerEmail,
        signedAt: signedAt.toISOString(),
      }),
    )
    .digest('hex');

  const manifest = {
    approvalId,
    workflowId: workflow.id,
    stepId: approval.stepId,
    stepName: step?.name ?? `Step ${approval.stepOrder}`,
    stepOrder: approval.stepOrder,
    documentVersionNumber: latestVersionNumber,
    action: 'approve',
  };

  const result = await pool.query(
    `INSERT INTO electronic_signatures (
       document_id, version_id, signature_type, signature_purpose,
       signer_id, signer_name, signer_title, signer_email,
       authentication_method, authentication_timestamp, second_factor_verified,
       signature_hash, signature_meaning, signature_manifest,
       is_valid, compliance_statement, legal_disclaimer,
       ip_address, device_info, signed_at
     ) VALUES (
       $1, $2, 'approval', 'approval',
       $3, $4, NULL, $5,
       'password+totp', $6, true,
       $7, $8, $9,
       true, NULL, NULL,
       $10, NULL, $6
     ) RETURNING id`,
    [
      workflow.documentId,
      versionRowId,
      userId,
      signerName,
      signerEmail,
      signedAt,
      signatureHash,
      meaning,
      JSON.stringify(manifest),
      ipAddress,
    ],
  );

  const signatureId = Number(result.rows[0].id);

  // 21 CFR Part 11 §11.10(e) — every signing event also lands in the
  // central audit trail. The signature hash correlates the two tables.
  void auditService.logAction({
    tenantId: sessionUser.organizationId ?? null,
    userId,
    action: 'approval.esign',
    resourceType: 'electronic_signature',
    resourceId: String(signatureId),
    ipAddress,
    userAgent: req.headers['user-agent'] as string | undefined,
    details: {
      approvalId,
      workflowId: workflow.id,
      documentId: workflow.documentId,
      versionId: versionRowId,
      documentVersionNumber: latestVersionNumber,
      authenticationMethod: 'password+totp',
      secondFactorVerified: true,
      signatureHash,
      meaning,
    },
  });

  return signatureId;
}

// ============================================================================
// POST /api/approval-workflows/:id/reject — Reject at current step
// ============================================================================

router.post('/:id/reject', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const approvalId = parseInt(req.params.id);
    const { comments } = req.body;

    if (!comments) {
      return res.status(400).json({
        error: 'Rejection reason is required',
      });
    }

    const result = await approvalOrchestrator.processApproval({
      approvalId,
      action: 'reject',
      performedBy: user.userId,
      comments,
    });

    return res.json({
      success: true,
      ...result,
      message: 'Workflow rejected',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Reject error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(400).json({ error: message });
  }
});

// ============================================================================
// POST /api/approval-workflows/:id/delegate — Delegate approval
// ============================================================================

router.post('/:id/delegate', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const approvalId = parseInt(req.params.id);
    const { delegateTo, reason } = req.body;

    if (!delegateTo) {
      return res.status(400).json({
        error: 'delegateTo (user ID) is required',
      });
    }

    await approvalOrchestrator.delegateApproval({
      approvalId,
      delegatedBy: user.userId,
      delegateTo,
      reason,
    });

    return res.json({
      success: true,
      message: `Approval delegated to user ${delegateTo}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Delegate error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(400).json({ error: message });
  }
});

// ============================================================================
// GET /api/approval-workflows/pending — Get pending approvals for current user
// ============================================================================

router.get('/pending', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const pending = await approvalOrchestrator.getPendingApprovals(
      user.userId,
      user.organizationId,
    );

    return res.json({
      success: true,
      approvals: pending,
      total: pending.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Pending error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// ============================================================================
// GET /api/approval-workflows/:workflowId/status — Full workflow status
// ============================================================================

router.get('/:workflowId/status', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const workflowId = parseInt(req.params.workflowId);
    const status = await approvalOrchestrator.getWorkflowStatus(workflowId);

    if (!status) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    return res.json({ success: true, workflow: status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Status error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to fetch workflow status' });
  }
});

// ============================================================================
// GET /api/approval-workflows/templates — List available workflow templates
// ============================================================================

router.get('/templates', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { moduleType } = req.query;

    let templates;
    if (moduleType) {
      templates = await db
        .select()
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.organizationId, user.organizationId),
            eq(workflowTemplates.isActive, true),
            eq(workflowTemplates.moduleType, moduleType as any),
          ),
        );
    } else {
      templates = await db
        .select()
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.organizationId, user.organizationId),
            eq(workflowTemplates.isActive, true),
          ),
        );
    }

    // Enrich with step counts
    const enriched = await Promise.all(
      templates.map(async t => {
        const steps = await db
          .select()
          .from(workflowSteps)
          .where(eq(workflowSteps.templateId, t.id))
          .orderBy(workflowSteps.order);

        return {
          ...t,
          steps: steps.map(s => ({
            id: s.id,
            name: s.name,
            order: s.order,
            approverType: s.approverType,
            approverIds: s.approverIds,
            requiredActions: s.requiredActions,
          })),
          stepCount: steps.length,
        };
      }),
    );

    return res.json({ success: true, templates: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Templates error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ============================================================================
// POST /api/approval-workflows/templates — Create a workflow template
// ============================================================================

router.post('/templates', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { name, description, moduleType, documentTypes, steps } = req.body;

    if (!name || !moduleType || !steps?.length) {
      return res.status(400).json({
        error: 'name, moduleType, and steps are required',
      });
    }

    // Create template
    const [template] = await db
      .insert(workflowTemplates)
      .values({
        name,
        description: description || '',
        moduleType,
        organizationId: user.organizationId,
        createdBy: user.userId,
        documentTypes: documentTypes || [],
      })
      .returning();

    // Create steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await db.insert(workflowSteps).values({
        templateId: template.id,
        name: step.name,
        description: step.description || '',
        order: i + 1,
        approverType: step.approverType || 'user',
        approverIds: step.approverIds || [],
        requiredActions: step.requiredActions || ['review'],
      });
    }

    return res.status(201).json({
      success: true,
      template: { id: template.id, name: template.name },
      message: `Template created with ${steps.length} steps`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Create template error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(400).json({ error: message });
  }
});

export default router;
