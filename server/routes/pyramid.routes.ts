/**
 * Submission Pyramid API routes — the read side of the deterministic
 * SubmissionPyramidEngine + globalPyramids modules, exposed to the ui-v2
 * `pyramid` surface (client/src/concept2cure/v2/surfaces/Pyramid.tsx).
 *
 * Every endpoint is a PURE deterministic read over the engine's static pyramid
 * definitions — no DB, no tenant data, no writes, no audit trail. Each adapts
 * the engine's rich SubmissionPyramid / GlobalPyramidConfig shape DOWN to the
 * client's display contract (PyType / PyPyramid / PyGlobalConfig in
 * fixtures/pyramid-data.ts) so the client renders route data directly.
 *
 *   GET /pyramids/types           → PyType[]         (type-selector metadata)
 *   GET /pyramids/:type           → PyPyramid        (adapted structure; 404 on unknown type)
 *   GET /global-pyramids          → PyGlobalConfig[] (distinct canonical configs)
 *   GET /global-pyramids/:type    → PyGlobalConfig   (single; 404 on unknown type)
 *
 * TASK STATUS — the engine models progress as a SEPARATE TaskProgress[]
 * (docs/PYRAMID_UI_ADVISORY.md §1.3 / §8); the immutable pyramid STRUCTURE
 * carries none. The structure read still emits every task at its honest initial
 * status 'todo' (the absence of recorded progress), and the org's RECORDED
 * progress is now merged over it from a real store:
 *
 *   GET   /pyramids/:type/progress        → the org's recorded task statuses
 *   PATCH /pyramids/:type/progress/:taskId → record one task's status
 *
 * "The UI owns status locally from there" is what this replaced, and it was the
 * defect: the surface's status dropdown wrote to a `statusOverrides` object in
 * component state, so a submission task marked Done updated the completion ring
 * and the phase bars, was never sent anywhere, and vanished on reload — or on
 * merely switching submission type, which cleared the overrides outright.
 *
 * DROPPED FIELDS (client rendered them; engine doesn't produce them → dropped,
 * never fabricated): PyPyramid.program (was a fixture-only program identifier);
 * PyPhase.weeks (engine phases carry no estimatedWeeks and only IND-family tasks
 * carry timeline data, so a per-phase week estimate cannot be sourced honestly
 * across all types).
 *
 * Engine import path uses the server→repo-root precedent (server/routes/
 * ind-sections.ts:29).
 *
 * AUTH — this router is mounted at /api/v1 (the X-API-Key "public API" prefix,
 * carved out of the global session boundary; see server/middleware/
 * authBoundary.ts). The canonical session boundary is applied PER-ROUTE below
 * rather than at
 * the app.use('/api/v1', …) mount ON PURPOSE: a prefix-level gate would run on
 * every /api/v1/* request and 401 every X-API-Key call to the sibling public
 * API (which shares the prefix and is registered right after this one). Per-
 * route auth JWT-protects exactly the pyramid endpoints and lets non-matching
 * /api/v1 requests fall through untouched to the public-API router.
 */
import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import { enforceTenantLifecycle } from '../middleware/tenantLifecycleGuard.js';
import { ok, clientError } from '../lib/api-response.js';
import { createFeatureStore } from '../utils/feature-persistence.js';
import {
  getAllSupportedTypes,
  getPyramidForProject,
  type SubmissionType,
  type SubmissionPyramid,
  type PyramidPhase,
  type PyramidTask,
} from '../../services/regulatory/SubmissionPyramidEngine.js';
import {
  getAvailableGlobalSubmissions,
  getGlobalPyramid,
  type GlobalSubmissionType,
  type GlobalPyramidConfig,
} from '../../services/regulatory/globalPyramids.js';

// ─── Client display contract (mirrors fixtures/pyramid-data.ts) ──────────────
// Defined locally — the server never imports client code. These are the exact
// shapes the Pyramid surface renders; the route adapts engine output into them.

interface PyGuidance {
  fda?: string;
  ich?: string;
  cfr?: string;
  keyConsiderations?: string[];
}

interface PyRisk {
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: number;
  impact: string;
  mitigations: string[];
}

interface PyTask {
  id: string;
  phase: string;
  name: string;
  role: string;
  hours: number;
  deps: string[];
  status: string;
  critical?: boolean;
  guidance?: PyGuidance;
  ctd: string[];
  deliverables?: string[];
  risk?: PyRisk;
}

interface PyPhase {
  id: string;
  name: string;
  order: number;
  weeks?: number;
}

interface PyPyramid {
  type: string;
  label: string;
  hours: number;
  phases: PyPhase[];
  tasks: PyTask[];
}

interface PyType {
  id: string;
  label: string;
  segment: 'pharma' | 'device' | 'cross-cutting';
  agency: string;
  ctd: string;
  phases: number;
  tasks: number;
  hours: number;
}

interface PyGlobalConfig {
  type: string;
  agency: string;
  region: string;
  format: string;
  days: number;
  tasks: number;
  local: string[];
}

// ─── Per-type display metadata ───────────────────────────────────────────────
// Factual regulatory reference facts (display name, sponsoring agency, market
// segment, dossier standard) for the 11 engine submission types — NOT fabricated
// program data. Counts (phases/tasks/hours) are derived live from the engine.
// Labels keep the em dash so the client's `label.split('—')` sub-label works.

interface TypeMeta {
  label: string;
  segment: 'pharma' | 'device' | 'cross-cutting';
  agency: string;
  ctd: string;
}

const TYPE_META: Record<SubmissionType, TypeMeta> = {
  NDA: { label: 'NDA — New Drug Application', segment: 'pharma', agency: 'FDA', ctd: 'M1–M5' },
  BLA: { label: 'BLA — Biologics License Application', segment: 'pharma', agency: 'FDA', ctd: 'M1–M5' },
  IND: { label: 'IND — Investigational New Drug', segment: 'pharma', agency: 'FDA', ctd: 'M1–M5' },
  '510K': { label: '510(k) — Premarket Notification', segment: 'device', agency: 'FDA', ctd: 'eSTAR' },
  DE_NOVO: { label: 'De Novo — Novel Device Classification', segment: 'device', agency: 'FDA', ctd: 'eSTAR' },
  PMA: { label: 'PMA — Premarket Approval', segment: 'device', agency: 'FDA', ctd: 'PMA' },
  MAA: { label: 'MAA — Marketing Authorisation (EU)', segment: 'cross-cutting', agency: 'EMA', ctd: 'M1–M5' },
  JNDA: { label: 'JNDA — Japanese New Drug Application', segment: 'cross-cutting', agency: 'PMDA', ctd: 'M1–M5' },
  IND_AMENDMENT: { label: 'IND Amendment — Protocol / Information', segment: 'pharma', agency: 'FDA', ctd: 'M1–M5' },
  IND_ANNUAL_REPORT: { label: 'IND Annual Report', segment: 'pharma', agency: 'FDA', ctd: 'M1–M5' },
  IND_SAFETY_SUPPLEMENT: { label: 'IND Safety Report — Expedited', segment: 'pharma', agency: 'FDA', ctd: 'M1–M5' },
};

// Engine region → the client PyGlobal browser's three continent filter buckets
// (Americas / Europe / Asia-Pacific). Geographic classification, not fabrication.
const REGION_BUCKET: Record<string, string> = {
  Canada: 'Americas',
  Brazil: 'Americas',
  'European Union': 'Europe',
  Switzerland: 'Europe',
  Japan: 'Asia-Pacific',
  Australia: 'Asia-Pacific',
  China: 'Asia-Pacific',
};

// ─── Engine → client adapters ────────────────────────────────────────────────

function pyramidHours(pyramid: SubmissionPyramid): number {
  if (typeof pyramid.totalEstimatedHours === 'number') return pyramid.totalEstimatedHours;
  return pyramid.tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
}

function adaptTask(task: PyramidTask): PyTask {
  const out: PyTask = {
    id: task.id,
    phase: task.phaseId,
    name: task.name,
    role: task.role ?? 'unassigned',
    hours: task.estimatedHours,
    deps: task.dependencies ?? [],
    // Honest initial state: the structure carries no recorded progress.
    status: 'todo',
    ctd: (task.documentBindings ?? []).map((b) => b.ctdSection),
  };
  if (task.critical) out.critical = true;
  if (task.deliverables && task.deliverables.length > 0) out.deliverables = task.deliverables;
  if (task.risk) {
    out.risk = {
      severity: task.risk.severity,
      probability: task.risk.probability,
      impact: task.risk.impact,
      mitigations: task.risk.mitigations ?? [],
    };
  }
  if (task.guidance) {
    const g: PyGuidance = {};
    if (task.guidance.fdaGuidanceRef) g.fda = task.guidance.fdaGuidanceRef;
    if (task.guidance.ichGuideline) g.ich = task.guidance.ichGuideline;
    if (task.guidance.cfrReference) g.cfr = task.guidance.cfrReference;
    if (task.guidance.keyConsiderations && task.guidance.keyConsiderations.length > 0) {
      g.keyConsiderations = task.guidance.keyConsiderations;
    }
    if (Object.keys(g).length > 0) out.guidance = g;
  }
  return out;
}

function adaptPhase(phase: PyramidPhase): PyPhase {
  const out: PyPhase = { id: phase.id, name: phase.name, order: phase.order };
  // Only IF the engine ever carries a real week estimate — never fabricated.
  if (typeof phase.estimatedWeeks === 'number') out.weeks = phase.estimatedWeeks;
  return out;
}

function adaptPyramid(pyramid: SubmissionPyramid): PyPyramid {
  const meta = TYPE_META[pyramid.type];
  return {
    type: pyramid.type,
    label: meta?.label ?? String(pyramid.type),
    hours: pyramidHours(pyramid),
    phases: pyramid.phases.map(adaptPhase),
    tasks: pyramid.tasks.map(adaptTask),
  };
}

function buildTypeList(): PyType[] {
  return getAllSupportedTypes().map((id) => {
    const meta = TYPE_META[id];
    const pyramid = getPyramidForProject(id);
    return {
      id,
      label: meta?.label ?? String(id),
      segment: meta?.segment ?? 'cross-cutting',
      agency: meta?.agency ?? '—',
      ctd: meta?.ctd ?? '—',
      phases: pyramid.phases.length,
      tasks: pyramid.tasks.length,
      hours: pyramidHours(pyramid),
    };
  });
}

function adaptGlobal(cfg: GlobalPyramidConfig): PyGlobalConfig {
  return {
    type: cfg.type,
    agency: cfg.agency,
    region: REGION_BUCKET[cfg.region] ?? cfg.region,
    format: cfg.format,
    days: cfg.totalEstimatedDays,
    tasks: cfg.tasks.length,
    local: cfg.localRequirements,
  };
}

function buildGlobalList(): PyGlobalConfig[] {
  // getAvailableGlobalSubmissions() includes alias keys (HC_NOC_C, HC_DIN, …)
  // that resolve to a shared canonical config; dedupe by the config's own type
  // so identical pyramids don't render as duplicate cards.
  const seen = new Set<string>();
  const out: PyGlobalConfig[] = [];
  for (const key of getAvailableGlobalSubmissions()) {
    const cfg = getGlobalPyramid(key);
    if (!cfg || seen.has(cfg.type)) continue;
    seen.add(cfg.type);
    out.push(adaptGlobal(cfg));
  }
  return out;
}

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/** GET /pyramids/types → PyType[] (all 11 engine types + selector metadata). */
router.get(
  '/pyramids/types',
  authMiddleware,
  enforceTenantLifecycle,
  (_req: Request, res: Response) => ok(res, buildTypeList())
);

/** GET /pyramids/:type → PyPyramid (adapted). 404 on an unsupported type. */
router.get(
  '/pyramids/:type',
  authMiddleware,
  enforceTenantLifecycle,
  (req: Request, res: Response) => {
    const raw = String(req.params.type ?? '');
    const match = getAllSupportedTypes().find(
      (t) => t === raw || t === raw.toUpperCase(),
    );
    if (!match) {
      return clientError(res, 404, `Unknown submission type: ${raw}`);
    }
    return ok(res, adaptPyramid(getPyramidForProject(match)));
  }
);


// ─── Task progress — the org's RECORDED status per pyramid task ──────────────
//
// Held in the feature store (category 'pyramid_task_progress', one row per
// organization + submission type) rather than a new table: this is a small
// per-org key→status map, exactly the shape the store exists for, and it needs
// no DDL to become real in a deployment that already has project_memory_entries.
const progressStore = createFeatureStore('pyramid_task_progress');

/** The task statuses the surface's dropdown offers — the advisory's state machine. */
const PY_TASK_STATUSES = new Set(['todo', 'in_progress', 'blocked', 'done']);

function progressOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown; organizationId?: unknown;
    tenantContext?: { organizationId?: unknown }; user?: { organizationId?: unknown };
  };
  const raw = r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** The supported submission type matching `raw`, or null. */
function matchType(raw: string): SubmissionType | null {
  return getAllSupportedTypes().find((t) => t === raw || t === raw.toUpperCase()) ?? null;
}

/** The org's stored progress row for one submission type, or null. */
async function loadProgressRow(orgId: number, type: string) {
  const rows = await progressStore.query(orgId, type);
  return rows[0] ?? null;
}

/** GET /pyramids/:type/progress → { statuses: { [taskId]: status } }. */
router.get('/pyramids/:type/progress', authMiddleware, enforceTenantLifecycle, async (
  req: Request,
  res: Response
) => {
  const orgId = progressOrgId(req);
  if (orgId === null) return clientError(res, 403, 'Organization context required.');
  const match = matchType(String(req.params.type ?? ''));
  if (!match) return clientError(res, 404, `Unknown submission type: ${req.params.type}`);
  try {
    const row = await loadProgressRow(orgId, match);
    return ok(res, { type: match, statuses: (row?.statuses as Record<string, string>) ?? {} });
  } catch (err) {
    // No recorded progress and an unreadable store are different claims, but
    // both render as "every task is todo" — so a broken read is reported, not
    // flattened into a clean board.
    if ((err as { code?: string })?.code === '42P01') {
      return ok(res, { type: match, statuses: {}, pendingStore: true });
    }
    console.error('[pyramid] progress read failed:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read pyramid task progress.' } });
  }
});

/**
 * PATCH /pyramids/:type/progress/:taskId → record one task's status.
 *
 * The task id is validated against the pyramid's own STRUCTURE, so progress
 * cannot be recorded against a task that does not exist in the submission type
 * being viewed — which is what would let a stale tab quietly write orphan rows
 * that never render anywhere.
 */
router.patch('/pyramids/:type/progress/:taskId', authMiddleware, enforceTenantLifecycle, async (
  req: Request,
  res: Response
) => {
  const orgId = progressOrgId(req);
  if (orgId === null) return clientError(res, 403, 'Organization context required.');
  const match = matchType(String(req.params.type ?? ''));
  if (!match) return clientError(res, 404, `Unknown submission type: ${req.params.type}`);

  const status = String((req.body ?? {}).status ?? '');
  if (!PY_TASK_STATUSES.has(status)) {
    return clientError(res, 400, `status must be one of: ${[...PY_TASK_STATUSES].join(', ')}.`);
  }
  const taskId = String(req.params.taskId ?? '');
  const structure = adaptPyramid(getPyramidForProject(match));
  const known = structure.tasks.some((t) => t.id === taskId);
  if (!known) {
    return clientError(res, 404, `No task ${taskId} in the ${match} pyramid.`);
  }

  try {
    const row = await loadProgressRow(orgId, match);
    const statuses: Record<string, string> = { ...((row?.statuses as Record<string, string>) ?? {}) };
    // 'todo' is the absence of recorded progress, so recording it REMOVES the
    // row rather than storing it — otherwise the store slowly fills with
    // entries that say nothing and a reset never actually resets.
    if (status === 'todo') delete statuses[taskId];
    else statuses[taskId] = status;

    const payload = { type: match, statuses };
    if (row) await progressStore.update(row.id, orgId, payload);
    else await progressStore.insert(orgId, match, `Pyramid task progress — ${match}`, payload);

    return ok(res, { type: match, taskId, status, statuses });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({
        error: { code: 'PROGRESS_STORE_UNPROVISIONED', message: 'The progress store is not provisioned in this deployment.' },
      });
    }
    console.error('[pyramid] progress write failed:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to record the task status.' } });
  }
});

/** GET /global-pyramids → PyGlobalConfig[] (distinct canonical global configs). */
router.get(
  '/global-pyramids',
  authMiddleware,
  enforceTenantLifecycle,
  (_req: Request, res: Response) => ok(res, buildGlobalList())
);

/** GET /global-pyramids/:type → PyGlobalConfig. 404 on an unsupported type. */
router.get(
  '/global-pyramids/:type',
  authMiddleware,
  enforceTenantLifecycle,
  (req: Request, res: Response) => {
    const raw = String(req.params.type ?? '');
    const match = getAvailableGlobalSubmissions().find(
      (t) => t === raw || t === raw.toUpperCase(),
    );
    if (!match) {
      return clientError(res, 404, `Unknown global submission type: ${raw}`);
    }
    return ok(res, adaptGlobal(getGlobalPyramid(match)));
  }
);

export default router;
