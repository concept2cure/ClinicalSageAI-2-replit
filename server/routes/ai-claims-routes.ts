/**
 * AI Claims → Binder Routes
 *
 * POST /api/ai/claims/:claimId/add-to-binder
 * Promotes a provenance-tracked AI claim into the IVDR evidence binder.
 *
 * Validation: claim must belong to org (via retrieval_run chain).
 * UNSUPPORTED claims cannot be added to binder.
 *
 * @module server/routes/ai-claims-routes
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

export default function createAIClaimsRoutes(pool: Pool): Router {
  const router = Router();

  // ── Org extraction (same pattern as IVDR binder routes) ────────────────
  function getServerOrgId(req: Request): number {
    const fromTenant = (req as any).tenantId;
    const fromContext = (req as any).tenantContext?.organizationId;
    const orgId = fromTenant || fromContext;
    if (!orgId) {
      throw new Error('NO_TENANT: organization context is missing from session');
    }
    const n = typeof orgId === 'string' ? Number(orgId) : orgId;
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('BAD_TENANT: invalid organization ID in session');
    }
    return n;
  }

  function getUserId(req: Request): string {
    return (req as any).userId || (req as any).user?.id || 'system';
  }

  /**
   * POST /claims/:claimId/add-to-binder
   *
   * Validates claim belongs to org, creates binder claim + evidence rows,
   * emits AI_CLAIM_ADDED_TO_BINDER audit event.
   */
  router.post('/claims/:claimId/add-to-binder', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const userId = getUserId(req);
      const { claimId } = req.params;
      const { projectId } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: 'projectId is required',
          code: 'MISSING_PROJECT_ID',
        });
      }

      // ── Validate claim belongs to this org via retrieval_run chain ────
      const claimResult = await pool.query(
        `SELECT c.id, c.claim_text, c.claim_hash_sha256, c.status, c.confidence,
                gr.retrieval_run_id, gr.model, gr.id as generation_run_id,
                rr.organization_id
         FROM ai_claims c
         JOIN ai_generation_runs gr ON gr.id = c.generation_run_id
         LEFT JOIN ai_retrieval_runs rr ON rr.id = gr.retrieval_run_id
         WHERE c.id = $1`,
        [claimId]
      );

      if (claimResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Claim not found',
          code: 'CLAIM_NOT_FOUND',
        });
      }

      const claim = claimResult.rows[0];

      // Verify org ownership
      if (claim.organization_id && Number(claim.organization_id) !== orgId) {
        return res.status(403).json({
          error: 'Claim does not belong to this organization',
          code: 'CLAIM_ORG_MISMATCH',
        });
      }

      // Prevent adding UNSUPPORTED claims — no citations = no binder
      if (claim.status === 'UNSUPPORTED') {
        return res.status(422).json({
          error: 'Cannot add UNSUPPORTED claim to binder — at least one citation required',
          code: 'CLAIM_UNSUPPORTED',
        });
      }

      // ── Fetch citations for this claim ───────────────────────────────
      const citationsResult = await pool.query(
        `SELECT cc.retrieval_chunk_id, cc.relevance_score,
                rc.atom_id, rc.vault_file_id, rc.vault_version_id,
                rc.title, rc.excerpt_preview, rc.excerpt_hash_sha256,
                rc.excerpt_start, rc.excerpt_end
         FROM ai_claim_citations cc
         JOIN ai_retrieval_chunks rc ON rc.id = cc.retrieval_chunk_id
         WHERE cc.claim_id = $1
         ORDER BY cc.relevance_score DESC`,
        [claimId]
      );

      // ── Create binder claim (ivdr_binder_claims) ─────────────────────
      const claimKey = `AI_CLAIM_${claim.claim_hash_sha256.substring(0, 12).toUpperCase()}`;

      const binderClaimResult = await pool.query(
        `INSERT INTO ivdr_binder_claims
           (organization_id, project_id, claim_key, title, description, status, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6)
         ON CONFLICT (organization_id, project_id, claim_key)
         DO UPDATE SET updated_at = now(), updated_by_user_id = $6
         RETURNING id`,
        [
          orgId,
          projectId,
          claimKey,
          claim.claim_text.substring(0, 200),
          `AI-generated claim (model: ${claim.model}, generation: ${claim.generation_run_id}). Full text: ${claim.claim_text}`,
          userId,
        ]
      );

      const binderClaimId = binderClaimResult.rows[0].id;

      // ── Attach evidence rows from citations ──────────────────────────
      // Discriminate vault vs atom sources — never stuff non-vault strings into vault columns
      let evidenceCount = 0;
      for (const cit of citationsResult.rows) {
        const hasVaultRef = !!(cit.vault_file_id && cit.vault_version_id);
        const sourceType = hasVaultRef ? 'vault' : 'atom';

        try {
          if (sourceType === 'vault') {
            await pool.query(
              `INSERT INTO ivdr_binder_evidence
                 (organization_id, project_id, claim_id, source_type,
                  vault_file_id, vault_version_id,
                  excerpt_start, excerpt_end, excerpt_hash_sha256, excerpt_preview,
                  notes, created_by_user_id)
               VALUES ($1, $2, $3, 'vault', $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                orgId,
                projectId,
                binderClaimId,
                cit.vault_file_id,
                cit.vault_version_id,
                cit.excerpt_start,
                cit.excerpt_end,
                cit.excerpt_hash_sha256,
                cit.excerpt_preview,
                `Source: ${cit.title || 'unknown'} (relevance: ${Math.round((cit.relevance_score || 0) * 100)}%)`,
                userId,
              ]
            );
          } else {
            // Atom-sourced evidence: vault columns stay NULL, atom IDs populated
            await pool.query(
              `INSERT INTO ivdr_binder_evidence
                 (organization_id, project_id, claim_id, source_type,
                  source_atom_id, source_retrieval_chunk_id,
                  excerpt_start, excerpt_end, excerpt_hash_sha256, excerpt_preview,
                  notes, created_by_user_id)
               VALUES ($1, $2, $3, 'atom', $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                orgId,
                projectId,
                binderClaimId,
                cit.atom_id || 'unknown',
                cit.retrieval_chunk_id,
                cit.excerpt_start,
                cit.excerpt_end,
                cit.excerpt_hash_sha256,
                cit.excerpt_preview,
                `Source: ${cit.title || 'unknown'} (relevance: ${Math.round((cit.relevance_score || 0) * 100)}%) [atom]`,
                userId,
              ]
            );
          }
          evidenceCount++;
        } catch (evErr: any) {
          // Duplicate evidence is fine — skip quietly
          if (evErr?.code !== '23505') {
            console.warn('[AI Claims] Evidence insert failed:', evErr.message);
          }
        }
      }

      // ── Emit audit event ─────────────────────────────────────────────
      try {
        const userName =
          (req as any).user?.displayName ||
          (req as any).user?.username ||
          (req as any).user?.email ||
          userId;
        const numericUserId = Number(userId) || 0;
        const now = new Date();
        await pool.query(
          `INSERT INTO audit_events
             (organization_id, event_type, entity_type, entity_id, user_id, user_name,
              metadata, "timestamp", created_at)
           VALUES ($1, 'AI_CLAIM_ADDED_TO_BINDER', 'ivdr_binder_claim', 0, $2, $3, $4::json, $5, $5)`,
          [
            orgId,
            numericUserId,
            userName,
            JSON.stringify({
              aiClaimId: claimId,
              binderClaimId,
              generationRunId: claim.generation_run_id,
              retrievalRunId: claim.retrieval_run_id,
              claimStatus: claim.status,
              citationCount: citationsResult.rows.length,
              evidenceAttached: evidenceCount,
              projectId,
              claimKey,
            }),
            now,
          ]
        );
      } catch (auditErr: any) {
        // Audit failures are logged but never block the primary operation
        console.warn('[AI Claims] Audit event insert failed:', auditErr.message);
      }

      res.json({
        ok: true,
        binderClaimId,
        claimKey,
        evidenceCount,
      });
    } catch (error: any) {
      console.error('[AI Claims] add-to-binder error:', error);

      if (error.message?.startsWith('NO_TENANT') || error.message?.startsWith('BAD_TENANT')) {
        return res.status(401).json({ error: 'Authentication failed', code: 'AUTH_ERROR' });
      }
      if (error?.code === '42P01') {
        return res.status(503).json({
          error: 'AI trace tables not yet provisioned — run migrations',
          code: 'AI_TRACE_NOT_PROVISIONED',
        });
      }

      res.status(500).json({
        error: 'Failed to add claim to binder',
        code: 'ADD_TO_BINDER_ERROR',
      });
    }
  });

  return router;
}
