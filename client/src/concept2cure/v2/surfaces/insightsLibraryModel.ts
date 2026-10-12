/**
 * The reporting library's read/write model — runs, schedules and bundles.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `shared/constants/ui-surface-registry.ui-v2.ts` records, for the `insights`
 * surface, that the 2026-10-01 reporting review found it claiming all of
 * `/api/report-os` and `/api/insights`, which made 21 routes no launch screen
 * calls reachable in production. The fix narrowed the claim to what the canvas
 * calls and left the note: "The rest stay unmapped, which production refuses,
 * until a screen needs one."
 *
 * These are those screens. Each capability here is a route the server already
 * serves and no human-clickable affordance reached:
 *
 *   - the run history        GET  /api/report-os/runs        (filters + sort)
 *   - a run's dependencies   GET  /api/report-os/runs/:id/dependencies
 *   - a run's seal           GET  /api/report-os/runs/:id/seal
 *   - the governed catalog   GET  /api/report-os/taxonomy, GET /scopes
 *   - scheduled reports      GET/POST/PATCH /api/insights/subscriptions
 *   - report bundles         GET/POST /api/report-os/bundles (+ export.pdf)
 *
 * ── HONESTY CONSTRAINTS ENCODED HERE ────────────────────────────────────────
 * 1. A SCHEDULE DOES NOT DELIVER A FILE. `services/report-os/scheduling/
 *    worker-register.ts` says so in its own docstring: `generateAndDeliver`
 *    computes the run and applies the delivery gate, then only LOGS it —
 *    "Full immutable-run persistence and external email transport are
 *    deliberately left to the existing /runs + /deliveries paths". So
 *    {@link SCHEDULE_DELIVERY_NOTE} is the only thing a schedule screen may
 *    claim, and it must be shown wherever a schedule is created or listed.
 * 2. A SCHEDULE IS ONLY OFFERED FOR A TYPE AN ENGINE COMPUTES. The sweep calls
 *    `computeInitialRun`, which throws for a type with no engine
 *    (`report-engine.ts` reportEngineFor → null for 43 of the 61 declared
 *    types). Scheduling one would create a row that fails every sweep, for
 *    ever, silently. {@link schedulableTypes} is the filter; the caller must
 *    use it rather than the whole catalog.
 * 3. A FAILED READ IS NOT AN EMPTY LIST. Every loader returns a discriminated
 *    state so a surface renders "couldn't read" separately from "none yet"
 *    (CLAUDE.md: an error is never rendered as an empty result).
 *
 * PURE except for the fetchers, which go through the project's one convention
 * (`apiCall` / `useLiveData` → `lib/queryClient`). No fixtures: there is no
 * code path here that returns invented rows.
 *
 * @module client/src/concept2cure/v2/surfaces/insightsLibraryModel
 */
import { apiCall, apiErrorText } from '../apiCall';

/* ══════════════════════════════════════════════════════════════════
   Runs
   ══════════════════════════════════════════════════════════════════ */

/** A row of `GET /api/report-os/runs`, as the route enriches it. */
export interface ReportRunRow {
  id: number;
  runUuid: string;
  scopeType: string;
  scopeId: string;
  reportTypeId: string;
  /** The route joins the registry label; it falls back to the id. */
  reportTypeLabel: string;
  status: string;
  confidence: number | null;
  blockers?: unknown;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  /** From `dependencySummary.summary.regulatory`, when the run recorded one. */
  regionCode?: string | null;
  registryId?: string | null;
  agency?: string | null;
}

/** The statuses a run can hold, in lifecycle order. */
export const RUN_STATUSES = ['queued', 'running', 'draft', 'partial', 'final', 'failed'] as const;

/**
 * How a run's status reads to a client. A sealed `final` is the only one that
 * is evidence; everything else is explicitly not, so a reader never mistakes a
 * draft for a filing-grade artifact.
 */
export const RUN_STATUS_LABEL: Readonly<Record<string, string>> = {
  queued: 'Queued',
  running: 'Running',
  draft: 'Draft',
  partial: 'Partial',
  final: 'Final — sealed',
  failed: 'Failed',
};

/** The filters `GET /runs` accepts. Omitted keys are not sent. */
export interface RunQuery {
  scopeType?: string;
  scopeId?: string;
  status?: string;
  reportTypeId?: string;
  search?: string;
  sortBy?: 'createdAt' | 'completedAt' | 'confidence' | 'status' | 'reportType' | 'scopeType';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

/**
 * The largest window `GET /runs` will serve (`listRunsSchema`: limit max 500).
 *
 * This is not a display preference, it is the honest bound on search. The
 * route applies `search` and `sortBy` IN MEMORY, AFTER the SQL `LIMIT`
 * (report-os.ts: `.limit(limit)` then `.filter(...)` then `.sort(...)`), so a
 * search only ever matches within the rows already fetched and a sort only
 * orders those rows. Asking for the maximum makes that window as wide as the
 * route allows; {@link runsSearchCaveat} is how the UI says so instead of
 * presenting a partial search as a complete one. The proper fix is server-side
 * — filter and sort in SQL before the limit — and is not a client's to make.
 */
export const RUNS_WINDOW = 500;

/**
 * What a reader must be told when a search or a non-default sort is in play,
 * or null when the answer is complete.
 *
 * `loaded` is how many rows came back. When it is below the window the route
 * returned everything it had, so the search really did cover every run and
 * there is nothing to qualify. When it equals the window, older runs exist
 * that were never searched — and saying nothing would present a truncated
 * answer as the whole one (CLAUDE.md: no silent caps).
 */
export function runsSearchCaveat(
  loaded: number,
  opts: { searching: boolean; sorted: boolean },
): string | null {
  if (!opts.searching && !opts.sorted) return null;
  if (loaded < RUNS_WINDOW) return null;
  const what = opts.searching && opts.sorted ? 'This search and ordering cover' : opts.searching ? 'This search covers' : 'This ordering covers';
  return (
    `${what} the ${RUNS_WINDOW} most recent runs only. The report engine filters and orders within that ` +
    'window, so an older run that matches is not shown. Narrow by status or report type to bring it inside.'
  );
}

/**
 * The run-history URL for a query, or null when there is nothing to ask for.
 * PURE, so the query building is testable without a DOM or a server.
 */
export function runsUrl(q: RunQuery): string {
  const p = new URLSearchParams();
  if (q.scopeType) p.set('scopeType', q.scopeType);
  if (q.scopeId) p.set('scopeId', q.scopeId);
  if (q.status) p.set('status', q.status);
  if (q.reportTypeId) p.set('reportTypeId', q.reportTypeId);
  if (q.search && q.search.trim()) p.set('search', q.search.trim());
  if (q.sortBy) p.set('sortBy', q.sortBy);
  if (q.sortOrder) p.set('sortOrder', q.sortOrder);
  if (q.limit != null) p.set('limit', String(q.limit));
  const qs = p.toString();
  return '/api/report-os/runs' + (qs ? `?${qs}` : '');
}

/* ══════════════════════════════════════════════════════════════════
   Schedules (report subscriptions)
   ══════════════════════════════════════════════════════════════════ */

export type Cadence = 'daily' | 'weekly' | 'monthly';
export type ScheduleFormat = 'pdf' | 'in_app';
export type ScheduleChannel = 'platform' | 'external';

/** The recurrence shape the server accepts (`reportScheduleSchema`). */
export interface ReportSchedule {
  cadence: Cadence;
  hour: number;
  minute?: number;
  /** 0=Sun..6=Sat, for `weekly`. */
  dayOfWeek?: number;
  /** 1..28, for `monthly` — clamped server-side so it is valid every month. */
  dayOfMonth?: number;
  timeZoneOffsetMinutes?: number;
}

/** A row of `GET /api/insights/subscriptions`. */
export interface SubscriptionRow {
  id: number;
  reportTypeId: string;
  scopeType: string;
  scopeId: string;
  schedule: ReportSchedule;
  recipients: string[] | null;
  format: string;
  channel: string;
  persona: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

/** The body `POST /api/insights/subscriptions` accepts. No `createdBy`: the
 *  server binds the creator from the session (reporting review 2026-10-01). */
export interface CreateSubscriptionBody {
  reportTypeId: string;
  scopeType: string;
  scopeId: string;
  schedule: ReportSchedule;
  recipients?: string[];
  format?: ScheduleFormat;
  channel?: ScheduleChannel;
  enabled?: boolean;
}

/**
 * What a schedule actually does today, in the words a client may be told.
 *
 * The sweep (`worker-register.ts`) computes the report on the cadence and
 * applies the delivery gate, and records that it ran. It does NOT persist an
 * immutable run row and does NOT send mail — its own docstring leaves both to
 * `/runs` and `/deliveries`. Any copy promising a delivered PDF or an email
 * would be a claim the platform does not keep, so this sentence is shown
 * wherever a schedule is created or listed.
 */
export const SCHEDULE_DELIVERY_NOTE =
  'A schedule computes the report on its cadence and records that it ran. It does not email a file or ' +
  'store a downloadable copy yet — open the report from Run history to export it.';

/** Why a schedule needs Redis to fire, stated where a client can act on it. */
export const SCHEDULE_SWEEP_NOTE =
  'Schedules fire from a background sweep that runs about every ten minutes.';

/** The cadence a client picks, and what it means in words. */
export const CADENCE_LABEL: Readonly<Record<Cadence, string>> = {
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
};

export const DAY_OF_WEEK_LABEL: readonly string[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/**
 * A schedule in words: "Every week on Tuesday at 08:00". PURE.
 *
 * `timeZoneOffsetMinutes` is carried but deliberately ignored by the server's
 * next-run math (`scheduling/cadence.ts` operates in UTC and says so), so the
 * time is labelled UTC rather than implying the reader's own zone.
 */
export function scheduleInWords(s: ReportSchedule): string {
  const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute ?? 0).padStart(2, '0')} UTC`;
  if (s.cadence === 'weekly') {
    const day = DAY_OF_WEEK_LABEL[s.dayOfWeek ?? 1] ?? DAY_OF_WEEK_LABEL[1];
    return `Every week on ${day} at ${time}`;
  }
  if (s.cadence === 'monthly') {
    return `Every month on day ${s.dayOfMonth ?? 1} at ${time}`;
  }
  return `Every day at ${time}`;
}

/**
 * The catalog types a schedule may name.
 *
 * A subscription's sweep calls `computeInitialRun`, which throws for a type no
 * engine computes — so scheduling one of the 43 declared-but-uncomputed types
 * would persist a row that fails every sweep for ever, and the client would
 * see a schedule that never produces anything. Only a runnable, entitled type
 * is offered. PURE.
 */
export function schedulableTypes<T extends { runnable?: boolean; entitled?: boolean }>(types: readonly T[]): T[] {
  return types.filter((t) => t.runnable === true && t.entitled !== false);
}

/* ══════════════════════════════════════════════════════════════════
   A run's Part 11 evidence: its seal, its signature, and its sources
   ══════════════════════════════════════════════════════════════════ */

/** One of the four checks `readRunSeal` performs, with its written reason. */
export interface SealCheck {
  check: 'audit-chain' | 'stored-seal' | 'stored-document' | 'signature';
  ok: boolean;
  detail: string;
}

/** `GET /api/report-os/runs/:id/seal` — the sealing act, read back and re-verified. */
export interface RunSealView {
  runId: number;
  sealed: boolean;
  seal: { algorithm: string | null; contentHash: string | null; atomCount: number | null; sealedAt: string | null } | null;
  finalizedAt: string | null;
  signature: { signerName: string | null; signedAt: string | null; meaning: string | null } | null;
  finalization: { reason: string | null; meaning: string | null; priorStatus: string | null } | null;
  verification: { verdict: 'intact' | 'mismatch' | 'not-verifiable'; checks: SealCheck[] };
}

/** One row of `GET /api/report-os/runs/:id/dependencies`. */
export interface RunDependencyRow {
  id: number;
  runId: number;
  provider: string;
  status: string;
  blocker: string | null;
  observedAt: string;
  payload?: unknown;
}

/** What each seal verdict MEANS, in the words an inspector needs.
 *
 *  The three are not degrees of the same thing, and must not read as if they
 *  were: `intact` is positive evidence, `mismatch` is positive evidence of a
 *  problem, and `not-verifiable` is the absence of evidence either way. A UI
 *  that rendered the last as a quiet "unverified" badge is how a broken chain
 *  stayed invisible (SECURITY-8, reporting review 2026-10-01). */
export const SEAL_VERDICT: Readonly<Record<string, { label: string; meaning: string }>> = {
  intact: {
    label: 'Seal verified',
    meaning:
      'The sealed document still hashes to the seal the audit chain recorded, and the electronic signature ' +
      'signed that same seal.',
  },
  mismatch: {
    label: 'Seal does not verify',
    meaning:
      'The stored record contradicts what the audit chain recorded for this finalization. The sealed document ' +
      'is withheld and the report is not exported as final.',
  },
  'not-verifiable': {
    label: 'Not verifiable',
    meaning:
      'There is no verified record on the audit chain to check this run against, so nothing is claimed about ' +
      'its seal either way.',
  },
};

/** One recorded field of a signature manifestation, ready to render. */
export interface SealFactRow {
  term: string;
  value: string;
  /** A hash, which wants the mono face and may wrap anywhere. */
  mono?: boolean;
}

/**
 * The signature manifestation's recorded fields, in reading order.
 *
 * PURE, and the reason this is not inline JSX: a field the record does not
 * carry is OMITTED, never rendered empty and never given a stand-in, and that
 * rule is worth testing without a DOM. 21 CFR 11.50 requires the signer, the
 * date and time, and the meaning; where the platform holds no value for one,
 * saying nothing is correct and inventing one is not.
 */
export function sealFactRows(view: RunSealView): SealFactRow[] {
  const sig = view.signature;
  const fin = view.finalization;
  const seal = view.seal;
  const sealText = seal?.contentHash
    ? [`${seal.algorithm ?? 'sha256'} ${seal.contentHash}`, seal.atomCount != null ? `${seal.atomCount} provenance atoms` : '']
        .filter(Boolean)
        .join(' · ')
    : '';
  return (
    [
      { term: 'Signed by', value: sig?.signerName ?? '' },
      { term: 'Signed at', value: sig?.signedAt ? whenText(sig.signedAt) : '' },
      { term: 'Meaning', value: sig?.meaning ?? '' },
      { term: 'Reason given', value: fin?.reason ?? '' },
      { term: 'Seal', value: sealText, mono: true },
      { term: 'Recorded on the chain', value: view.finalizedAt ? whenText(view.finalizedAt) : '' },
    ] as SealFactRow[]
  ).filter((r) => r.value.length > 0);
}

/** The four checks, in the order a reader follows them. */
export const SEAL_CHECK_LABEL: Readonly<Record<string, string>> = {
  'audit-chain': 'Audit chain record',
  'stored-seal': 'Stored seal',
  'stored-document': 'Sealed document',
  signature: 'Electronic signature',
};

/**
 * How a dependency's status reads. `blocker` carries the server's own sentence
 * when there is one, so nothing here paraphrases a reason the engine gave.
 */
export const DEPENDENCY_STATUS_LABEL: Readonly<Record<string, string>> = {
  ok: 'Read',
  fresh: 'Read',
  stale: 'Stale',
  missing: 'Not available',
  blocked: 'Blocked',
  error: 'Failed',
};

/* ══════════════════════════════════════════════════════════════════
   Bundles
   ══════════════════════════════════════════════════════════════════ */

/** One report inside a bundle, as the server stored it at bundling time. */
export interface BundleItem {
  runId: number;
  runUuid: string;
  reportTypeId: string;
  reportTypeLabel: string;
  scopeType: string;
  scopeId: string;
  /** The status the run held WHEN IT WAS BUNDLED. The PDF prints this beside
   *  the status read at export, so a bundle never implies a run is still in
   *  the state it was packaged in. */
  status: string;
  confidence: number | null;
  createdAt: string;
}

/** A row of `GET /api/report-os/bundles`. */
export interface BundleRow {
  bundleId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  createdBy?: number | null;
  projectIds: number[];
  runIds: number[];
  items: BundleItem[];
}

/**
 * Why a bundle can be refused with 422 even though every run exists: a bundle
 * is stored as a memory entry on each project its runs cover, so a run that
 * belongs to no project has nowhere to put one (`report-os.ts` POST /bundles).
 * Stated to the client rather than shown as a generic failure.
 */
export const BUNDLE_NEEDS_PROJECT_NOTE =
  'A bundle is filed against the projects its reports belong to. Reports that belong to no project ' +
  'cannot be bundled.';

/**
 * What a bundle's PDF actually is.
 *
 * It is a MANIFEST, not the reports: `pdf/bundle-pdf.ts` prints one line per
 * report — id, label, scope, status now, status at bundling, confidence — and
 * states in the document itself that "Each report's own PDF carries its
 * signature and seal". Offering it as "the reports as one PDF" would hand an
 * inspector an index where they expected the evidence, so the UI names it a
 * manifest and says where the sealed documents are.
 */
export const BUNDLE_PDF_IS_A_MANIFEST =
  "A bundle's PDF is a manifest: one line per report with its status at export beside the status it was " +
  "bundled at, and how many are final. It does not contain the reports themselves — each report's own " +
  'PDF carries its document, signature and seal, and is exported from Run history.';

/* ══════════════════════════════════════════════════════════════════
   Writes
   ══════════════════════════════════════════════════════════════════ */

/** The outcome of a write, with the server's own reason when it refused. */
export interface WriteOutcome<T = unknown> {
  ok: boolean;
  /** The server's message, already filtered for internals by `apiErrorText`. */
  message?: string;
  data?: T;
  status: number;
}

/** Create a schedule. The creator and the org come from the session. */
export async function createSubscription(body: CreateSubscriptionBody): Promise<WriteOutcome<SubscriptionRow>> {
  const res = await apiCall<{ data: SubscriptionRow }>('POST', '/api/insights/subscriptions', body);
  if (!res.ok) {
    return { ok: false, status: res.status, message: apiErrorText(res, 'The schedule was not saved.') };
  }
  return { ok: true, status: res.status, data: res.body?.data };
}

/** Pause or resume a schedule. */
export async function setSubscriptionEnabled(id: number, enabled: boolean): Promise<WriteOutcome<SubscriptionRow>> {
  const res = await apiCall<{ data: SubscriptionRow }>('PATCH', `/api/insights/subscriptions/${id}`, { enabled });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: apiErrorText(res, enabled ? 'The schedule was not resumed.' : 'The schedule was not paused.'),
    };
  }
  return { ok: true, status: res.status, data: res.body?.data };
}

/** Bundle chosen runs into one governed pack. */
export async function createBundle(
  name: string,
  runIds: number[],
  description?: string,
): Promise<WriteOutcome<BundleRow>> {
  const res = await apiCall<{ data: BundleRow }>('POST', '/api/report-os/bundles', {
    name,
    runIds,
    ...(description && description.trim() ? { description: description.trim() } : {}),
  });
  if (!res.ok) {
    // 422 is the "no project to file it under" case, which has its own reason.
    const fallback = res.status === 422 ? BUNDLE_NEEDS_PROJECT_NOTE : 'The bundle was not created.';
    return { ok: false, status: res.status, message: apiErrorText(res, fallback) };
  }
  return { ok: true, status: res.status, data: res.body?.data };
}

/* ══════════════════════════════════════════════════════════════════
   Formatting
   ══════════════════════════════════════════════════════════════════ */

/**
 * A timestamp as a client reads it, or an em dash when there is none.
 * Never invents a time for a null column (a schedule that has never run has
 * no `lastRunAt`, and "just now" would be a fabrication).
 */
export function whenText(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * A confidence as a percentage, or the reason there is none.
 *
 * `report_runs.confidence` is nullable and a domain register measures none
 * (`report-engine.ts`: "No confidence: nothing measures one for a register").
 * A null must therefore read as "not measured", never as 0%.
 */
export function confidenceText(c: number | null | undefined): string {
  return c == null ? 'Not measured' : `${c}%`;
}
