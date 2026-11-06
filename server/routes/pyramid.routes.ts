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
import { requestDb, requestPgClient } from '../db/requestDb';
import { ProjectAdmissionRefusal, requireProjectAdmission } from './c2c/project-access';
import { isSameSubmissionType } from '@shared/regulatory/submission-type-bridge';
import { getTimeline } from '../services/market-specs/regulatory-timelines.js';
import {
  getAllSupportedTypes,
  getPyramidForProject,
  backSchedule,
  ScheduleError,
  phaseGate,
  scheduleSummary,
  type BackSchedule,
  type SubmissionType,
  type SubmissionPyramid,
  type PyramidPhase,
  type PyramidTask,
  type TaskStatus,
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
  /** The task that completes the phase (phaseGate): the workstream's milestone, and whose owner leads it. */
  gate?: string;
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

function adaptPhase(phase: PyramidPhase, pyramid: SubmissionPyramid): PyPhase {
  const out: PyPhase = { id: phase.id, name: phase.name, order: phase.order };
  const gate = phaseGate(pyramid, phase.id);
  if (gate) out.gate = gate;
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
    phases: pyramid.phases.map((ph) => adaptPhase(ph, pyramid)),
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

/* The project's pyramid (S11, founder decision P-82; THE_PROGRAM_2026-11-01.md §7.2): mounted here, before
   '/pyramids/:type', so 'by-project' is never read as a submission type. The handlers are below the progress store. */
router.get('/pyramids/by-project', authMiddleware, enforceTenantLifecycle, (req: Request, res: Response) => sendPortfolioLines(req, res));
router.get('/pyramids/by-project/:ref', authMiddleware, enforceTenantLifecycle, (req: Request, res: Response) => sendProjectPyramid(req, res));
router.patch('/pyramids/by-project/:ref/progress/:taskId', authMiddleware, enforceTenantLifecycle,
  (req: Request, res: Response) => recordProjectTaskStatus(req, res));

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

/** The store's table is absent (42P01). Drizzle wraps the driver's error, so its code is on `cause`: reading only
 *  `err.code` turned a deployment without project_memory_entries into a 500 instead of the honest
 *  'not provisioned' answer (2026-11-04, the dev database the program-plan walk ran on). */
function isUndefinedTable(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '42P01' || e?.cause?.code === '42P01';
}

/** The task statuses: the engine's own TaskStatus, which the surface's dropdown offers (PY_STATUS). Until
 *  2026-11-01 this read 'in_progress' and had no 'review', so "In progress" and "In review" were refused. */
const PY_TASK_STATUS_LIST: readonly TaskStatus[] = ['todo', 'in-progress', 'review', 'done', 'blocked'];
const PY_TASK_STATUSES = new Set<string>(PY_TASK_STATUS_LIST);

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

/** The org's stored progress row under one key (a submission type, or a project's key below), or null. */
async function loadProgressRow(orgId: number, key: string) {
  const rows = await progressStore.query(orgId, key);
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
    if (isUndefinedTable(err)) {
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
    if (isUndefinedTable(err)) {
      return res.status(503).json({
        error: { code: 'PROGRESS_STORE_UNPROVISIONED', message: 'The progress store is not provisioned in this deployment.' },
      });
    }
    console.error('[pyramid] progress write failed:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to record the task status.' } });
  }
});

// ─── The project's pyramid: its work breakdown, with this project's progress ──
//
// GET   /pyramids/by-project/:ref                    → { programId, type, label, pyramid, statuses, target, asOf, schedule } — or, for a
//                                                       filing the engine has no pyramid for, { type: null, filing }
// PATCH /pyramids/by-project/:ref/progress/:taskId   → record one task's status on this project
//
// Progress was kept per organisation and submission type, so two NDAs shared one board (THE_PROGRAM §6). Here it
// is the project's: a row of the same store keyed on the program (subcategory 'project:<program uuid>:<type>'),
// beside the per-type rows above, which stay readable as they are. :ref is the program UUID or its integer
// project, admitted as the project's objective is (workspace, sharing, archive). The pyramid is the one its
// recorded filing resolves to (shared/regulatory/submission-type-bridge.ts), never a guess: the exact catalogue
// choice intake keeps in metadata.submissionTypeId (as serializeProgramDetail reads it), else program_type.

const UUID_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The pyramid a recorded filing has: the supported type it resolves to, or null (fail closed). */
export function pyramidTypeForFiling(recorded: string | null | undefined): SubmissionType | null {
  const filing = String(recorded ?? '').trim();
  if (!filing) return null;
  return getAllSupportedTypes().find((t) => isSameSubmissionType(t, filing)) ?? null;
}

/** The store row's key for one project's progress over one pyramid. */
export const projectProgressKey = (programId: string, type: SubmissionType) => `project:${programId.toLowerCase()}:${type}`;

interface ProjectPyramidScope {
  orgId: number; programId: string; filing: string | null; type: SubmissionType | null;
  /** regulatory_programs.target_submission_date as YYYY-MM-DD (the date set at intake and in Project settings), or null. */
  target: string | null;
}

type ScopeRefusal = { status: 403 | 404; message: string };

/** The admitted project behind :ref, with its recorded filing and its pyramid. Answers the refusal itself and returns null. */
async function projectPyramidScope(req: Request, res: Response, forWrite: boolean): Promise<ProjectPyramidScope | null> {
  const scope = await resolveProjectPyramid(req, String(req.params.ref ?? '').trim(), forWrite);
  if ('message' in scope) { clientError(res, scope.status, scope.message); return null; }
  return scope;
}

/** The admitted project behind `ref`, in the session's organisation, or why not. An admission refusal is thrown. */
async function resolveProjectPyramid(req: Request, ref: string, forWrite: boolean): Promise<ProjectPyramidScope | ScopeRefusal> {
  const orgId = progressOrgId(req);
  if (orgId === null) return { status: 403, message: 'Organization context required.' };
  const { strictProjectRowForRef } = await import('../services/c2c/program-project-anchor.js');
  const projectId = await strictProjectRowForRef(requestDb(req), { ref, orgId, context: 'pyramid-progress' });
  if (projectId === null) return { status: 404, message: 'Project not found.' };
  await requireProjectAdmission(req, String(projectId), forWrite,
    UUID_REF.test(ref) ? { executor: requestPgClient(req), programId: ref.toLowerCase() } : undefined);
  const { rows } = await requestPgClient(req).query(
    `SELECT rp.id::text AS program_id, COALESCE(NULLIF(rp.metadata->>'submissionTypeId', ''), rp.program_type) AS filing,
            to_char(rp.target_submission_date, 'YYYY-MM-DD') AS target
       FROM projects p JOIN regulatory_programs rp ON rp.id = p.regulatory_program_id AND rp.organization_id = p.organization_id
      WHERE p.id = $1 AND p.organization_id = $2`, [projectId, orgId]);
  const row = rows[0] as { program_id?: string; filing?: string | null; target?: string | null } | undefined;
  if (!row?.program_id) return { status: 404, message: 'This project has no program record.' };
  return { orgId, programId: row.program_id, filing: row.filing ?? null, type: pyramidTypeForFiling(row.filing), target: row.target ?? null };
}

function projectPyramidRefusal(res: Response, err: unknown, doing: string) {
  if (err instanceof ProjectAdmissionRefusal) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (isUndefinedTable(err) && doing === 'record') {
    return res.status(503).json({ error: { code: 'PROGRESS_STORE_UNPROVISIONED', message: 'The progress store is not provisioned in this deployment.' } });
  }
  console.error(`[pyramid] project progress ${doing} failed:`, err instanceof Error ? err.message : String(err));
  return res.status(500).json({ error: { code: 'INTERNAL', message: doing === 'read'
    ? "This project's plan could not be read." : 'The task status was not recorded. Nothing was changed.' } });
}

/** Today, UTC, YYYY-MM-DD: the day the schedule is read against. */
const todayIso = () => new Date().toISOString().slice(0, 10);

/** The project's schedule (S11 step 3): every task's start and due date, back-scheduled by the engine from the target
 *  date along the pyramid's dependencies. No target recorded is said (null), never a date assumed. */
function projectSchedule(type: SubmissionType, target: string | null): { schedule: BackSchedule | null; scheduleRefusal?: string } {
  if (!target) return { schedule: null };
  try {
    return { schedule: backSchedule(getPyramidForProject(type), target) };
  } catch (err) {
    if (err instanceof ScheduleError) return { schedule: null, scheduleRefusal: err.message };
    throw err;
  }
}

/** The project's recorded statuses. As for the per-type read: a missing store is said, a broken read is an error. */
async function projectStatuses(scope: ProjectPyramidScope & { type: SubmissionType }): Promise<{ statuses: Record<string, string>; pendingStore: boolean }> {
  try {
    const row = await loadProgressRow(scope.orgId, projectProgressKey(scope.programId, scope.type));
    return { statuses: (row?.statuses as Record<string, string>) ?? {}, pendingStore: false };
  } catch (err) {
    if (!isUndefinedTable(err)) throw err;
    return { statuses: {}, pendingStore: true };
  }
}

/** Review-clock pathways (server/services/market-specs/regulatory-timelines.ts) for the pyramids that have one. */
const REVIEW_PATHWAY: Partial<Record<SubmissionType, string>> = {
  '510K': '510k', DE_NOVO: 'de_novo', PMA: 'pma', NDA: 'fda_nda', BLA: 'fda_nda', MAA: 'eu_maa',
};
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The agency's clock after the filing (THE_PROGRAM §8 item 4), from the engines that hold it, never a model: the
 * published goals by pathway (regulatory-timelines.ts) and the IND's 30-day review from its own pyramid
 * (phase8.submit, 21 CFR 312.40). Calendar days from the target date. Null where none is held (J-NDA, the IND's
 * amendment, annual report and safety report) or no target is recorded.
 */
export function reviewClock(type: SubmissionType, target: string | null) {
  if (!target) return null;
  const pathway = REVIEW_PATHWAY[type];
  const t = pathway ? getTimeline(pathway) : undefined;
  if (t?.targetDecisionDays) {
    const decision = t.milestones.find((m) => m.kind === 'decision');
    return { authority: t.authority, basis: t.basis, days: t.targetDecisionDays, ends: addDays(target, t.targetDecisionDays),
      label: decision?.label ?? 'Decision goal', caveat: t.caveat, clockStops: t.clockStops,
      milestones: t.milestones.filter((m) => m.day && m.kind !== 'submission' && m.kind !== 'decision')
        .map((m) => ({ label: m.label, day: m.day as number, date: addDays(target, m.day as number) })) };
  }
  const days = type === 'IND' ? getPyramidForProject('IND').tasks.find((x) => x.id === 'phase8.submit')?.timeline?.regulatoryDeadlineDays : undefined;
  if (!days) return null;
  return { authority: 'FDA', basis: '21 CFR 312.40', days, ends: addDays(target, days), label: 'Study may proceed',
    caveat: 'The study may begin 30 days after FDA receives the IND, unless FDA places it on clinical hold.', clockStops: false, milestones: [] };
}

/**
 * GET /pyramids/by-project?refs=<ref>,<ref>… → { asOf, lines: { [ref]: line } }: the portfolio line on Projects
 * (THE_PROGRAM §5, §9 step 6), one read for a page of cards. Each ref is admitted as the single read admits it; a
 * project the person may not read, or that is not in their organisation, answers { unavailable: true } and nothing
 * else, so the batch tells no more than the single read would.
 */
async function sendPortfolioLines(req: Request, res: Response) {
  const refs = [...new Set(String(req.query.refs ?? '').split(',').map((r) => r.trim()).filter(Boolean))];
  if (refs.length === 0 || refs.length > 100) return clientError(res, 400, 'Name 1 to 100 projects in refs.');
  if (progressOrgId(req) === null) return clientError(res, 403, 'Organization context required.');
  const asOf = todayIso();
  const lines: Record<string, unknown> = {};
  for (const ref of refs) lines[ref] = await portfolioLine(req, ref, asOf);
  return ok(res, { asOf, lines });
}

async function portfolioLine(req: Request, ref: string, asOf: string) {
  try {
    const scope = await resolveProjectPyramid(req, ref, false);
    if ('message' in scope) return { unavailable: true };
    if (!scope.type) return { type: null, filing: scope.filing };
    const { statuses, pendingStore } = await projectStatuses(scope as ProjectPyramidScope & { type: SubmissionType });
    const { schedule } = projectSchedule(scope.type, scope.target);
    return { type: scope.type, target: scope.target, summary: scheduleSummary(getPyramidForProject(scope.type), schedule, statuses, asOf),
      ...(pendingStore ? { pendingStore: true } : {}) };
  } catch (err) {
    if (err instanceof ProjectAdmissionRefusal) return { unavailable: true };
    console.error('[pyramid] portfolio line failed:', err instanceof Error ? err.message : String(err));
    return { unreadable: true };
  }
}

async function sendProjectPyramid(req: Request, res: Response) {
  try {
    const scope = await projectPyramidScope(req, res, false);
    if (!scope) return;
    if (!scope.type) return ok(res, { programId: scope.programId, type: null, filing: scope.filing });
    const { statuses, pendingStore } = await projectStatuses(scope as ProjectPyramidScope & { type: SubmissionType });
    const pyramid = adaptPyramid(getPyramidForProject(scope.type));
    return ok(res, { programId: scope.programId, type: scope.type, label: pyramid.label, filing: scope.filing, pyramid, statuses,
      target: scope.target, asOf: todayIso(), ...projectSchedule(scope.type, scope.target),
      reviewClock: reviewClock(scope.type, scope.target),
      ...(pendingStore ? { pendingStore: true } : {}) });
  } catch (err) {
    return projectPyramidRefusal(res, err, 'read');
  }
}

async function recordProjectTaskStatus(req: Request, res: Response) {
  const status = String((req.body ?? {}).status ?? '');
  if (!PY_TASK_STATUSES.has(status)) {
    return clientError(res, 400, `status must be one of: ${[...PY_TASK_STATUSES].join(', ')}.`);
  }
  try {
    const scope = await projectPyramidScope(req, res, true);
    if (!scope) return;
    if (!scope.type) return clientError(res, 409, `The engine has no work breakdown for this project's filing (${scope.filing ?? 'none recorded'}).`);
    const taskId = String(req.params.taskId ?? '');
    if (!adaptPyramid(getPyramidForProject(scope.type)).tasks.some((t) => t.id === taskId)) {
      return clientError(res, 404, `No task ${taskId} in the ${scope.type} pyramid.`);
    }
    const key = projectProgressKey(scope.programId, scope.type);
    const row = await loadProgressRow(scope.orgId, key);
    const statuses: Record<string, string> = { ...((row?.statuses as Record<string, string>) ?? {}) };
    if (status === 'todo') delete statuses[taskId];
    else statuses[taskId] = status;
    const payload = { type: scope.type, programId: scope.programId, statuses };
    if (row) await progressStore.update(row.id, scope.orgId, payload);
    else await progressStore.insert(scope.orgId, key, `Pyramid task progress — ${scope.type}, program ${scope.programId}`, payload);
    return ok(res, { programId: scope.programId, type: scope.type, taskId, status, statuses });
  } catch (err) {
    return projectPyramidRefusal(res, err, 'record');
  }
}

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
