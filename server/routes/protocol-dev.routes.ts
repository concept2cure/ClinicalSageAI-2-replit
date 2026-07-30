/**
 * Protocol-development authoring hub — protocol document read for the v2 surface.
 *
 * GET /api/protocol-dev → the org's in-development protocol(s), each shaped to the
 * PdevDoc contract the v2 ProtocolDev surface renders.
 *
 * ── Convergence (why this changed) ──────────────────────────────────────────
 * There were two disconnected protocol lineages. The REAL authoring store —
 * `protocol_documents` + its normalized children (protocol_sections / _objectives /
 * _eligibility_criteria / _schedule_visits / …) — is written by
 * protocol-development-service.ts through the /api/protocol-development CRUD routes
 * AND the AnA protocol tools. But this surface used to read `c2c_protocol_dev`, a
 * separate single-blob table that NOTHING writes in production (only the ga-demo
 * seed), so a real tenant's protocol never appeared here.
 *
 * This read now PREFERS the real store and assembles the PdevDoc from it. It falls
 * back to the legacy `c2c_protocol_dev` blob only when the org has no real
 * protocol_documents yet — which keeps the demo tenant and any legacy rows working
 * untouched (non-destructive; c2c_protocol_dev is deprecated, not dropped).
 *
 * Coverage: header + sections + content + objectives + eligibility + schedule
 * visits + the deterministic completeness assessment map from the real store today.
 * The register-form sub-entities (risks / milestones / amendments / deviations /
 * budget / reviews) have their own protocol_* tables and their own write endpoints;
 * they return honest-empty here until their read mapping lands (Phase 2), rather
 * than showing the legacy blob's values against a real document.
 *
 * Org scoped; 403 without org context; fails closed to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import {
  listProtocolDocuments,
  getProtocolDocument,
  getCompleteness,
} from '../services/protocol-development/protocol-development-service.js';

const router = Router();

/** Cap assembly so a large corpus can't turn one read into hundreds of queries. */
const MAX_DOCS = 25;

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

const str = (v: unknown): string => (v == null ? '' : String(v));

/** Assemble the PdevDoc render contract from one real normalized protocol document. */
function toPdevDoc(full: Record<string, any>, completenessPct: number, findings: unknown[]): Record<string, unknown> {
  const sections = Array.isArray(full.sections) ? full.sections : [];
  const objectives = Array.isArray(full.objectives) ? full.objectives : [];
  const eligibility = Array.isArray(full.eligibility) ? full.eligibility : [];
  const visits = Array.isArray(full.visits) ? full.visits : [];

  // Section content → the ContentBlock map the surface renders, keyed by section id.
  const content: Record<string, unknown[]> = {};
  for (const s of sections) {
    if (s.content) {
      content[str(s.id)] = [{ h: str(s.title), p: str(s.content), prov: { src: 'authoring', conf: '', audit: '' } }];
    }
  }
  const openSection = str((sections.find((s: any) => s.status === 'draft' || s.status === 'in_progress') ?? sections[0])?.id ?? '');

  return {
    id: str(full.id),
    title: str(full.title),
    shortTitle: str(full.protocol_number),      // no short_title column in the real store
    kind: str(full.protocol_kind),
    version: str(full.version),
    status: str(full.status),
    sponsor: '',                                 // not modeled in protocol_documents
    pi: '',                                      // not modeled in protocol_documents
    updated: str(full.updated_at),
    completeness: completenessPct,
    openSection,
    sections: sections.map((s: any) => ({
      id: str(s.id),
      num: str(s.order_index ?? ''),
      title: str(s.title),
      status: str(s.status),
      required: !!s.required,
    })),
    content,
    objectives: objectives.map((o: any) => ({
      id: str(o.id),
      type: str(o.objective_type),
      text: str(o.objective),
      endpoint: str(o.endpoint),
    })),
    eligibility: {
      inclusion: eligibility.filter((e: any) => e.kind === 'inclusion').map((e: any) => ({ id: str(e.id), text: str(e.criterion) })),
      exclusion: eligibility.filter((e: any) => e.kind === 'exclusion').map((e: any) => ({ id: str(e.id), text: str(e.criterion) })),
    },
    soa: {
      visits: visits.map((v: any) => ({ id: str(v.id), label: str(v.visit_name), day: str(v.timepoint), window: '' })),
      assessments: [],                           // Phase 2 ← protocol_soa_assessments
      cells: {},                                 // Phase 2 ← protocol_soa_cells
      issues: [],
    },
    // Phase 2 — register-form sub-entities have their own protocol_* tables + write
    // endpoints; honest-empty here until their read mapping lands.
    risks: [],                                   // ← protocol_risks
    milestones: [],                              // ← protocol_milestones
    budget: { params: { enrollment: 0, sponsorPerSubject: 0, faRate: 0 }, items: [] }, // ← protocol_budget_*
    amendments: [],                              // ← protocol_amendments
    deviations: [],                              // ← protocol_deviations
    reviews: [],                                 // ← protocol_reviews
    consent: [],                                 // no normalized table
    completenessFindings: (findings as any[]).map((f) => ({ sev: str(f?.severity), text: str(f?.message) })),
  };
}

/** Prefer the real normalized store; returns [] when the org has none yet. */
async function readRealStore(orgId: number): Promise<Record<string, unknown>[]> {
  const list = (await listProtocolDocuments(orgId)).slice(0, MAX_DOCS);
  const out: Record<string, unknown>[] = [];
  for (const row of list) {
    const docId = Number(row.id);
    const full = await getProtocolDocument(orgId, docId);
    if (!full) continue;
    let pct = 0;
    let findings: unknown[] = [];
    try {
      const c = await getCompleteness(orgId, docId);
      pct = Math.round(c.requiredCompletionPct ?? 0);
      findings = c.findings ?? [];
    } catch {
      /* completeness is best-effort; a doc still renders without it */
    }
    out.push(toPdevDoc(full, pct, findings));
  }
  return out;
}

/** Legacy read of the deprecated single-blob store — the fallback for demo/legacy orgs. */
async function readLegacyStore(orgId: number): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query(
    `SELECT id, title, short_title, kind, version, status, sponsor, pi, updated,
            completeness, open_section, sections, content, objectives, eligibility,
            soa, risks, milestones, budget, amendments, deviations, reviews, consent,
            completeness_findings
       FROM c2c_protocol_dev
      WHERE organization_id = $1
      ORDER BY seq, id`,
    [orgId],
  );
  return rows.map((r) => ({
    id: r.id, title: r.title, shortTitle: r.short_title, kind: r.kind, version: r.version,
    status: r.status, sponsor: r.sponsor, pi: r.pi, updated: r.updated, completeness: r.completeness,
    openSection: r.open_section, sections: r.sections ?? [], content: r.content ?? {},
    objectives: r.objectives ?? [], eligibility: r.eligibility ?? { inclusion: [], exclusion: [] },
    soa: r.soa ?? { visits: [], assessments: [], cells: {}, issues: [] }, risks: r.risks ?? [],
    milestones: r.milestones ?? [], budget: r.budget ?? { params: {}, items: [] }, amendments: r.amendments ?? [],
    deviations: r.deviations ?? [], reviews: r.reviews ?? [], consent: r.consent ?? [],
    completenessFindings: r.completeness_findings ?? [],
  }));
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const real = await readRealStore(orgId);
    if (real.length > 0) {
      return res.json({ data: real, meta: { count: real.length, source: 'protocol_documents' } });
    }
  } catch (err) {
    // 42P01 = the real store isn't provisioned here; fall through to the legacy read.
    if ((err as { code?: string })?.code !== '42P01') {
      return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read protocol.' } });
    }
  }
  try {
    const legacy = await readLegacyStore(orgId);
    return res.json({ data: legacy, meta: { count: legacy.length, source: 'c2c_protocol_dev', legacy: true } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read protocol.' } });
  }
});

export default router;
