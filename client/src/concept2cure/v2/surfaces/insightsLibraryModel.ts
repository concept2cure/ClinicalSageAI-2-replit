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
 * ── GOVERNED CONTRACTS ────────────────────────────────────────────────────
 * Run history filters and orders in the canonical SQL service before paging.
 * Schedules retain their generated report and a platform inbox link in one
 * audited transaction. They do not finalize a report or send external email.
 * Unavailable engines and failed reads are stated explicitly.
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
  scopeLabel?: string | null;
  computedScope?: string | null;
}

/**
 * The statuses a run can actually hold.
 *
 * Read off the writers, not guessed: `POST /runs` writes `'partial'` or
 * `'completed'` (report-os.ts) and finalize writes `'final'`. Nothing in the
 * codebase writes queued, running or failed, and the schema's `'queued'`
 * default is overwritten in the same transaction. An earlier version of this
 * list offered four states that could never match and omitted `'completed'` —
 * the commonest clean one — so the filter had four dead options and a clean run
 * rendered as a raw lowercase word.
 */
export const RUN_STATUSES = ['partial', 'completed', 'final'] as const;

/**
 * How a run's status reads to a client.
 *
 * `final` says "final" and nothing about the seal. The list that shows these
 * does not read `/runs/:id/seal`, so calling it "sealed" here would assert a
 * verification this screen has not performed — the run's evidence disclosure
 * is where the seal is actually checked, and a final run whose seal mismatches
 * must not read as sealed in a table (the SECURITY-8 rule in this module).
 */
export const RUN_STATUS_LABEL: Readonly<Record<string, string>> = {
  partial: 'Partial',
  completed: 'Computed',
  final: 'Final',
  // Kept because the column is free text and an older or future writer may use
  // them; an unknown value still renders raw on a neutral tag rather than
  // falling through to anything reassuring.
  draft: 'Draft',
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
  offset?: number;
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
  if (q.offset != null) p.set('offset', String(q.offset));
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
  timeZone?: string;
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

/** A successful occurrence persists the report and its platform inbox delivery. */
export const SCHEDULE_DELIVERY_NOTE =
  'A schedule saves a governed report and places a link in the platform inbox. Open the saved report ' +
  'to verify its sources, export it or finalize it through the signature ceremony. External email delivery is unavailable.';

/** The PostgreSQL sweep checks due occurrences independently of Redis. */
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
 * The named timezone is retained with the recurrence, including daylight-saving changes.
 */
export function scheduleInWords(s: ReportSchedule): string {
  const offset = s.timeZoneOffsetMinutes;
  const zone = s.timeZone || (offset ? `UTC${offset < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}` : 'UTC');
  const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute ?? 0).padStart(2, '0')} ${zone}`;
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
 * engine computes — so scheduling one of the 39 declared-but-uncomputed types
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

/** The seal's algorithm, hash and atom count as one line, or '' when unsealed. */
function sealHashText(seal: RunSealView['seal']): string {
  if (!seal?.contentHash) return '';
  const algorithm = seal.algorithm ?? 'sha256';
  const atoms = seal.atomCount == null ? '' : `${seal.atomCount} provenance atoms`;
  return [`${algorithm} ${seal.contentHash}`, atoms].filter(Boolean).join(' · ');
}

/**
 * The rows that are NOT §11.50 elements: the reason, the chain's own record of
 * the meaning and prior status, the seal, and the two times. Omitted when the
 * record does not carry them — a row of dashes claims nothing.
 */
function sealExtraRows(view: RunSealView, sealText: string): SealFactRow[] {
  const fin = view.finalization;
  const sealedAt = view.seal?.sealedAt;
  const rows: SealFactRow[] = [
    { term: 'Reason given', value: fin?.reason ?? '' },
    { term: 'Chain records the meaning as', value: fin?.meaning ?? '' },
    { term: 'Status before finalizing', value: fin?.priorStatus ?? '' },
    { term: 'Seal', value: sealText, mono: true },
    { term: 'Sealed at', value: sealedAt ? whenText(sealedAt) : '' },
    { term: 'Recorded on the chain', value: view.finalizedAt ? whenText(view.finalizedAt) : '' },
  ];
  return rows.filter((r) => r.value.length > 0);
}

/** A §11.50(a) element's value, or the fact that the record does not carry it. */
function orNotRecorded(value: string | null | undefined | false): string {
  return value ? value : 'Not recorded';
}

/**
 * The signature manifestation's recorded fields, in reading order.
 *
 * PURE, and the reason this is not inline JSX: which fields may be omitted is a
 * 21 CFR 11.50 question worth testing without a DOM.
 *
 * TWO CLASSES OF FIELD, and the first draft treated them alike. §11.50(a)
 * requires the signer's printed name, the date and time of execution, and the
 * MEANING of the signature. For those three, absence is itself a record fact an
 * inspector needs: a row carrying a signer and a time but a null
 * `signature_meaning` (a nullable column) rendered two lines and no third, which
 * reads as a complete manifestation under a green banner. So on a SEALED run
 * those three are always present, reading "Not recorded" when the record does
 * not carry them.
 *
 * The rest — the reason given, the seal hash, the chain time — are not §11.50
 * elements. They are omitted when absent, because a row of dashes is noise and
 * nothing is being claimed by their absence.
 *
 * `signatureAbsent` distinguishes "no signature row exists" from "a row exists
 * with gaps": the server returns `signature: null` for the former, and the seal
 * checks say whether the signature was examined at all.
 */
export function sealFactRows(view: RunSealView): SealFactRow[] {
  const sig = view.signature;
  const sealText = sealHashText(view.seal);
  /* §11.50(a): shown on a sealed run whether or not the record carries them. */
  const manifestation: SealFactRow[] = [
    { term: 'Signed by', value: orNotRecorded(sig?.signerName) },
    { term: 'Signed at', value: orNotRecorded(sig?.signedAt && whenText(sig.signedAt)) },
    { term: 'Meaning', value: orNotRecorded(sig?.meaning) },
  ];
  return [...(view.sealed ? manifestation : []), ...sealExtraRows(view, sealText)];
}

/**
 * Whether the record holds no electronic signature at all, as distinct from
 * holding one with gaps. The server returns `signature: null` only after
 * looking for a live row on a final run (`run-seal.ts` readSealRecord).
 */
export function signatureAbsent(view: RunSealView): boolean {
  return view.sealed && view.signature == null;
}

/**
 * Whether the displayed signer, time and meaning have been tied to THIS seal.
 *
 * `run-seal.ts` binds exactly one thing: that the signature manifest's
 * `act.sealHash` equals the hash the chain recorded. The name, time and meaning
 * come from separate columns and no check ties them to the chain row's actor or
 * meaning. So when the seal does not verify — or the signature check itself did
 * not pass — the block must say it is the record as stored rather than a
 * verified binding.
 */
export function signatureIsVerifiedAgainstSeal(view: RunSealView): boolean {
  if (view.verification?.verdict !== 'intact') return false;
  const sigCheck = (view.verification.checks ?? []).find((c) => c.check === 'signature');
  return sigCheck?.ok === true;
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
  // The vocabulary the providers actually emit (providers/types.ts): ready,
  // partial, missing. An earlier version of this map was keyed to ok/fresh/
  // stale/blocked/error — invented words — so every healthy provider rendered
  // as a raw lowercase "ready" in the amber hue meant for a draft.
  ready: 'Read',
  partial: 'Partly read',
  missing: 'Not available',
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
