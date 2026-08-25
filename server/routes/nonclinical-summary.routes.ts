/**
 * Nonclinical Module 2.6 / Module 4 summary — a live projection of the governed
 * nonclinical registry.
 *
 * GET /api/nonclinical-summary → the org's M2.6 subsection readiness, Module 4
 * (4.2.x) placement readiness, and SEND package-readiness rollup, computed from
 * the governed `nonclinical_studies` + `send_datasets` rows via the existing
 * deterministic composers (`assembleNonclinicalSummary` → `buildM26NonclinicalSummaries`
 * + `ctdSectionFor` + `evaluateSendReadiness`). Nothing is fabricated: the view
 * reflects the audited registry and cannot drift stale.
 *
 * Shape: `{ data: { m26, m4, send, completeness, gaps, provisioned }, meta }`.
 *
 * Org scoped; 403 without org context. When the org has no governed studies (or
 * on any store error) it returns the honest ICH M4S skeleton (every data-bearing
 * subsection `missing`, expected categories as gaps) — never 500, never invents
 * study data. A missing store (42P01) is surfaced via `meta.pendingStore`.
 */
import { Router, type Request, type Response } from 'express';
import { requestDb } from '../db/requestDb';
import { coauthorDocuments } from '../../shared/schema';
import { listStudiesForSummary } from '../services/nonclinical/nonclinical-service';
import { assembleNonclinicalSummary, composeM26WrittenSummary, renderM26Html } from '../services/nonclinical/m26-m4-view';

const router = Router();

function getUserId(req: Request): string | null {
  const r = req as { user?: { id?: unknown; userId?: unknown } };
  const raw = r.user?.id ?? r.user?.userId;
  return raw === undefined || raw === null ? null : String(raw);
}

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res
      .status(403)
      .json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const studies = await listStudiesForSummary(orgId);
    const view = assembleNonclinicalSummary(studies);
    return res.json({ data: view, meta: { count: studies.length, provisioned: view.provisioned } });
  } catch (err) {
    // An unprovisioned registry fails closed to the empty-registry skeleton —
    // never fabricated nonclinical content — and says so via meta.pendingStore.
    //
    // Anything else is a real failure and now answers 5xx. The skeleton reports
    // `provisioned: false` with every section empty; emitting that after a
    // broken query told the Module 2.6 surface "the registry holds no studies"
    // when the truth was "we could not read the registry". Those are different
    // claims and only one of them is checkable by a reviewer.
    if ((err as { code?: string })?.code === '42P01') {
      const view = assembleNonclinicalSummary([]);
      return res.json({
        data: view,
        meta: { count: 0, provisioned: false, pendingStore: true },
      });
    }
    console.error(
      '[nonclinical-summary] study registry read failed:',
      err instanceof Error ? err.message : String(err),
    );
    return res.status(500).json({
      error: { code: 'INTERNAL', message: 'Failed to read the nonclinical study registry.' },
    });
  }
});

/**
 * POST /api/nonclinical-summary/document — compose the Module 2.6 nonclinical
 * written summary from the governed study registry and PERSIST it as an authored
 * document in the org's coauthor_documents store (module_number '2.6'), so the
 * deterministic composer's output becomes retrievable and flows into the eCTD
 * assembler (which renders coauthor_documents leaves to PDF). No fabrication:
 * the document body is exactly what composeM26WrittenSummary produced from the
 * audited studies. Refuses to persist when the org has no studies (nothing to
 * summarise) rather than writing an empty/placeholder document.
 */
router.post('/document', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  let studies;
  try {
    studies = await listStudiesForSummary(orgId);
  } catch (err) {
    const pending = (err as { code?: string })?.code === '42P01';
    return res.status(pending ? 503 : 500).json({
      error: {
        code: pending ? 'STORE_NOT_PROVISIONED' : 'INTERNAL',
        message: pending ? 'Nonclinical registry is not provisioned.' : 'Failed to read the nonclinical registry.',
      },
    });
  }
  if (studies.length === 0) {
    return res.status(422).json({
      error: {
        code: 'NO_STUDIES',
        message: 'No governed nonclinical studies to summarise — nothing to persist. Add studies to the registry first.',
      },
    });
  }
  try {
    const result = composeM26WrittenSummary(studies);
    const content = renderM26Html(result);
    // Request-scoped DB so the write runs on the tenant-context connection when
    // RLS is enforced (falls back to the pool-bound db pre-tenant-context).
    const [document] = await requestDb(req)
      .insert(coauthorDocuments)
      .values({
        organizationId: orgId,
        title: result.title,
        content,
        moduleNumber: '2.6',
        status: 'draft',
        createdBy: getUserId(req),
      })
      .returning({ id: coauthorDocuments.id });
    return res.status(201).json({
      data: {
        documentId: document.id,
        title: result.title,
        moduleNumber: '2.6',
        completeness: result.completeness,
        gaps: result.gaps,
        tableCount: result.tables.length,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: { code: 'PERSIST_FAILED', message: 'Failed to persist the Module 2.6 written summary.' },
    });
  }
});

export default router;
