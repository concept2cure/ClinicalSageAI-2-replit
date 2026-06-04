/**
 * /api/biopharma/bla — BLA 351(a) biologics workbench.
 *
 * Backend for the biotech "crown jewel": the three biologics science engines
 * that the design's BLA workbench binds to.
 *
 *   POST /api/biopharma/bla/analytical-similarity   run + optionally persist
 *   POST /api/biopharma/bla/comparability           run + optionally persist
 *   POST /api/biopharma/bla/immunogenicity          run + optionally persist
 *   GET  /api/biopharma/bla/assessments             list (filter by program/kind)
 *   GET  /api/biopharma/bla/assessments/:id         single assessment
 *   POST /api/biopharma/bla/assessments/:id/sign    governed Part 11 sign-off
 *
 * Compute is a pure function of the request body (the engines are stateless);
 * persistence and sign-off are org-scoped and program-scoped against
 * c2c_bla_assessments. The sign-off writes the SHA-256-chained audit_logs +
 * c2c_ana_actions ledger via the shared recordGovernedAction primitive.
 *
 * @module server/routes/biopharma/bla-workbench
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../../db.js';
import { recordGovernedAction } from '../c2c/actions.js';
import { assessAnalyticalSimilarity, type SimilarityAssessmentInput } from '../../services/biologics/analytical-similarity.js';
import { assessComparability, type ComparabilityInput } from '../../services/biologics/comparability.js';
import { assessImmunogenicity, type ImmunogenicityInput } from '../../services/biologics/immunogenicity.js';
import { assessBlaFilingRisk, type BlaFilingRiskInput } from '../../services/biologics/regulatory-risk.js';

const router = Router();

type Kind = 'analytical_similarity' | 'comparability' | 'immunogenicity' | 'filing_risk';

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.user?.id ?? r.userId ?? r.user?.userId;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function send(res: Response, code: number, body: unknown) {
  return res.status(code).json(body);
}

// Top-level verdict denormalized onto the row for fast listing.
function verdictFor(kind: Kind, result: any): string | null {
  if (kind === 'immunogenicity') return result?.risk?.tier ?? null;
  if (kind === 'filing_risk') return result?.crlRisk ?? null;
  return result?.conclusion ?? null;
}

/**
 * Optionally persist a computed assessment. Returns the stored row (id + meta)
 * when a programId is supplied (or persist:true), otherwise null.
 */
async function maybePersist(
  req: Request,
  orgId: number,
  kind: Kind,
  input: { modality?: string | null; referenceProduct?: string | null; targetAgency?: string | null },
  rawInput: unknown,
  result: any,
): Promise<Record<string, unknown> | null> {
  const body = req.body ?? {};
  const programId: string | null = body.programId ?? null;
  const persist: boolean = body.persist ?? Boolean(programId);
  if (!persist) return null;

  const { rows } = await pool.query(
    `INSERT INTO c2c_bla_assessments
       (org_id, program_id, kind, title, modality, reference_product, target_agency,
        status, verdict, input, result, created_by, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9::jsonb, $10::jsonb, $11, $12)
     RETURNING id, program_id, kind, title, status, verdict, created_at`,
    [
      orgId,
      programId,
      kind,
      body.title ?? null,
      input.modality ?? null,
      input.referenceProduct ?? null,
      input.targetAgency ?? null,
      verdictFor(kind, result),
      JSON.stringify(rawInput ?? {}),
      JSON.stringify(result ?? {}),
      resolveUserId(req),
      String(orgId),
    ],
  );
  return rows[0] ?? null;
}

// ── POST /analytical-similarity ───────────────────────────────────────────────

router.post('/analytical-similarity', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send(res, 403, { error: 'FORBIDDEN' });

  const body = (req.body ?? {}) as SimilarityAssessmentInput & { attributes?: unknown };
  if (!Array.isArray(body.attributes) || body.attributes.length === 0) {
    return send(res, 400, { error: 'BAD_REQUEST', message: 'attributes[] is required' });
  }

  try {
    const result = assessAnalyticalSimilarity(body);
    const assessment = await maybePersist(
      req,
      orgId,
      'analytical_similarity',
      { modality: body.modality, referenceProduct: body.referenceProduct, targetAgency: body.targetAgency },
      body,
      result,
    );
    return send(res, 200, { result, assessment });
  } catch (err) {
    console.error('[bla/analytical-similarity]', err);
    return send(res, 500, { error: 'INTERNAL_ERROR' });
  }
});

// ── POST /comparability ───────────────────────────────────────────────────────

router.post('/comparability', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send(res, 403, { error: 'FORBIDDEN' });

  const body = (req.body ?? {}) as ComparabilityInput & { attributes?: unknown };
  if (!Array.isArray(body.attributes) || body.attributes.length === 0) {
    return send(res, 400, { error: 'BAD_REQUEST', message: 'attributes[] is required' });
  }

  try {
    const result = assessComparability(body);
    const assessment = await maybePersist(
      req,
      orgId,
      'comparability',
      { modality: body.modality, referenceProduct: null, targetAgency: body.targetAgency },
      body,
      result,
    );
    return send(res, 200, { result, assessment });
  } catch (err) {
    console.error('[bla/comparability]', err);
    return send(res, 500, { error: 'INTERNAL_ERROR' });
  }
});

// ── POST /immunogenicity ──────────────────────────────────────────────────────

router.post('/immunogenicity', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send(res, 403, { error: 'FORBIDDEN' });

  const body = (req.body ?? {}) as ImmunogenicityInput & { arms?: unknown };
  if (!Array.isArray(body.arms) || body.arms.length === 0) {
    return send(res, 400, { error: 'BAD_REQUEST', message: 'arms[] is required' });
  }

  try {
    const result = assessImmunogenicity(body);
    const assessment = await maybePersist(
      req,
      orgId,
      'immunogenicity',
      { modality: body.modality, referenceProduct: null, targetAgency: body.targetAgency },
      body,
      result,
    );
    return send(res, 200, { result, assessment });
  } catch (err) {
    console.error('[bla/immunogenicity]', err);
    return send(res, 500, { error: 'INTERNAL_ERROR' });
  }
});

// ── POST /filing-risk ─────────────────────────────────────────────────────────
//
// Biologics-specific RTF/CRL filing-risk profile. Consumes the conclusions of
// the three science engines plus CMC/clinical readiness signals.

router.post('/filing-risk', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send(res, 403, { error: 'FORBIDDEN' });

  const body = (req.body ?? {}) as BlaFilingRiskInput;

  try {
    const result = assessBlaFilingRisk(body);
    const assessment = await maybePersist(
      req,
      orgId,
      'filing_risk',
      { modality: body.modality, referenceProduct: null, targetAgency: null },
      body,
      result,
    );
    return send(res, 200, { result, assessment });
  } catch (err) {
    console.error('[bla/filing-risk]', err);
    return send(res, 500, { error: 'INTERNAL_ERROR' });
  }
});

// ── GET /assessments ──────────────────────────────────────────────────────────

router.get('/assessments', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send(res, 403, { error: 'FORBIDDEN' });

  const { programId, kind } = req.query as Record<string, string | undefined>;
  const conditions = ['org_id = $1'];
  const params: unknown[] = [orgId];
  if (programId) {
    params.push(programId);
    conditions.push(`program_id = $${params.length}`);
  }
  if (kind) {
    params.push(kind);
    conditions.push(`kind = $${params.length}`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, program_id, kind, title, modality, reference_product, target_agency,
              status, verdict, created_by, created_at, updated_at, signed_by, signed_at
         FROM c2c_bla_assessments
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 200`,
      params,
    );
    return send(res, 200, { assessments: rows });
  } catch (err) {
    console.error('[bla/assessments] GET', err);
    return send(res, 500, { error: 'INTERNAL_ERROR' });
  }
});

// ── GET /assessments/:id ──────────────────────────────────────────────────────

router.get('/assessments/:id', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send(res, 403, { error: 'FORBIDDEN' });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM c2c_bla_assessments WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (rows.length === 0) return send(res, 404, { error: 'NOT_FOUND' });
    return send(res, 200, rows[0]);
  } catch (err) {
    console.error('[bla/assessments] GET /:id', err);
    return send(res, 500, { error: 'INTERNAL_ERROR' });
  }
});

// ── POST /assessments/:id/sign ────────────────────────────────────────────────
//
// Governed Part 11 sign-off. Records the SHA-256-chained audit_logs +
// c2c_ana_actions ledger inside the same transaction as the status flip.
// (The full re-authenticated e-signature meaning is captured by the universal
// /api/c2c/actions/sign path the design's EsignModal drives; this endpoint
// governs the assessment-level write in place.)

router.post('/assessments/:id/sign', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId || !userId) return send(res, 403, { error: 'FORBIDDEN' });

  const reason: string = (req.body?.reason ?? '').trim();
  if (reason.length < 5) {
    return send(res, 400, { error: 'BAD_REQUEST', message: 'A reason for sign-off (≥5 chars) is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, status FROM c2c_bla_assessments WHERE id = $1 AND org_id = $2 FOR UPDATE`,
      [req.params.id, orgId],
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return send(res, 404, { error: 'NOT_FOUND' });
    }
    if (existing.rows[0].status === 'signed') {
      await client.query('ROLLBACK');
      return send(res, 409, { error: 'ALREADY_SIGNED' });
    }

    await client.query(
      `UPDATE c2c_bla_assessments
          SET status = 'signed', signed_by = $1, signed_at = now(),
              signature_reason = $2, updated_at = now()
        WHERE id = $3 AND org_id = $4`,
      [userId, reason, req.params.id, orgId],
    );

    const ledger = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'sign',
      target: `bla_assessment:${req.params.id}`,
      reason,
      payload: { kind: 'bla_assessment' },
      domain: 'biopharma',
      surface: 'bla',
    });

    await client.query('COMMIT');
    return send(res, 200, { id: req.params.id, status: 'signed', ledger });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[bla/assessments] POST /:id/sign', err);
    return send(res, 500, { error: 'INTERNAL_ERROR' });
  } finally {
    client.release();
  }
});

export default router;
