/**
 * Evidence-ask read — the org's latest REAL corpus ask.
 *
 * GET /api/evidence-asks → the org's most recent evidence ask, assembled ENTIRELY
 * from the real, org-scoped AI trace chain (ai_retrieval_runs + ai_retrieval_chunks +
 * ai_generation_runs — the exact provenance tables POST /api/evidence/ask persists on
 * every live ask), shaped to the keys the v2 Evidence surface renders ({ question,
 * askedAt, pedigree, answer, answerRetained, cites, model, chunks[{n,doc,page,sim,
 * snip}], suggestions }). There is no seed-only blob and no fallback: an org that has
 * never run an ask returns null and the surface renders its honest empty state.
 *
 * Honest fields: the trace chain retains the answer's HASH, not its prose → answer is
 * null with answerRetained:false (the traced source chunks are the grounded evidence);
 * cite indices and follow-up suggestions are not part of the provenance chain → []
 * (never fabricated). See evidence-asks-view-assembler.
 *
 * Org scoped; 403 without org context; fails closed to null on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { assembleOrgEvidenceAsks } from '../services/evidence/evidence-asks-view-assembler';

const router = Router();

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
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const asks = await assembleOrgEvidenceAsks(orgId);
    if (asks.length === 0) {
      return res.json({ data: null, meta: { count: 0, source: 'ai_retrieval_runs' } });
    }
    const latest = asks[0];
    // `suggestions` are the org's REAL recent questions (distinct, capped) — never
    // invented prompts. Clicking one re-runs it live against the corpus.
    const suggestions: string[] = [];
    const seen = new Set<string>();
    for (const a of asks) {
      const qn = (a.question || '').trim();
      if (qn && !seen.has(qn)) {
        seen.add(qn);
        suggestions.push(qn);
      }
      if (suggestions.length >= 6) break;
    }
    const data = { ...latest, suggestions };
    return res.json({ data, meta: { count: asks.length, source: 'ai_retrieval_runs' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: null, meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read evidence ask.' } });
  }
});

export default router;
