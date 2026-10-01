import { Router } from 'express';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getPool } from '../../db';
import { getTenantScope } from '../../db/tenantStore';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { makeUploadFileFilter } from '../../middleware/uploadAllowlist';
import { assertUploadSafe, UploadSafetyError } from '../../middleware/uploadSafety';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import {
  aiExplainStability,
  aiCoachPriorities,
  aiFixPlanFromIssues,
  aiDraftP8,
  aiRootCauseOOS,
  aiDraftProtocol,
  aiCAPAFromOOT,
  type StabilityContext,
} from '../services/ai/stability.js';
import { estimateShelfLife } from '../../services/cmc/shelf-life';
import { assessTrend, OOT_METHOD } from '../../services/cmc/stability-trending';
import type { ParsedAcceptanceCriterion } from '../../services/cmc/recorded-stability';
import { logAuditEvent } from '../../services/audit/auditLogger';
import { parse } from 'csv-parse/sync';
import { toBuffer as barcodePng } from 'bwip-js/node';
import { format } from 'date-fns';
import { insertAllDayEvent, calendarEnabled } from '../services/calendar';
import {
  callerOwnsPlatformIntegrations,
  notYourIntegrationNote,
} from '../../services/integrations/platform-integration-owner';
import { authedActorName } from '../../utils/authedActor';
import { serverError } from '../../lib/api-response';
import { createScopedLogger } from '../../utils/logger';

/**
 * The VERIFIED acting principal, for GxP attribution columns
 * (stab_results.reviewed_by, stab_chain.actor, stab_samples.collected_by).
 *
 * These read `req.headers['x-user-name'] || '<placeholder>'` — attacker-
 * controlled, and defaulting to strings like 'user', 'reviewer' and 'collector'
 * that identify nobody while still satisfying the column. Chain-of-custody and
 * review attribution that any caller can assert is not attribution.
 * See ledger C-18.
 */
function requireActor(req: any): string {
  const actor = authedActorName(req);
  if (!actor) throw new Error('Actor identity required');
  return actor;
}

const logger = createScopedLogger('stability-router');

const router = Router();

/**
 * The stab_studies status vocabulary is the table's CHECK constraint
 * (db/migrations/022_stability_v2.sql): ONGOING, ON_HOLD, COMPLETED. Client
 * words map onto it; an omitted status is ONGOING, the column's own default.
 * DRAFT and CANCELLED have no state here and are refused — storing a draft as
 * ONGOING would record a study as executing when the user said it was not.
 * (The old fallback wrote 'DRAFT', which the constraint rejects: every create
 * without a status was a 500.)
 */
export const STAB_STUDY_STATUS = {
  ACTIVE: 'ONGOING',
  ONGOING: 'ONGOING',
  PAUSED: 'ON_HOLD',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
} as const;

export function toStabStudyStatus(raw: unknown): 'ONGOING' | 'ON_HOLD' | 'COMPLETED' | null {
  if (raw === undefined || raw === null || raw === '') return 'ONGOING';
  return (STAB_STUDY_STATUS as Record<string, 'ONGOING' | 'ON_HOLD' | 'COMPLETED'>)[String(raw).toUpperCase()] ?? null;
}

/**
 * The storage conditions this endpoint can plan, with their ICH Q1A(R2)
 * settings. Any other code (REF, INUSE, STRESS) has no defined temperature
 * here; it used to be written as an invented '5°C'. Refused instead.
 */
export const STAB_PLANNED_CONDITIONS: Record<string, { temp: string; rh: string }> = {
  LT: { temp: '25°C', rh: '60%' },
  INT: { temp: '30°C', rh: '65%' },
  ACC: { temp: '40°C', rh: '75%' },
};
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/json',
  'application/xml',
  'text/xml',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'image/png',
  'image/jpeg',
]);

/**
 * The upload receiver for this router's three multipart routes (results CSV,
 * excursions CSV, chain-of-custody attachment). Until 2026-09-25 it was
 * `multer({ storage: multer.memoryStorage() })`: no size limit, so a client
 * could buffer any number of bytes into this process's heap, and no filter, so
 * the type was checked only after the whole body had been read (security audit
 * 2026-09-24, IAM-14; plan P1-5). Bounded here; the byte check and the malware
 * scan run in validateUploadedFile below through the shared guard.
 */
const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: makeUploadFileFilter({
    extensions: ['pdf', 'csv', 'txt', 'json', 'xml', 'xls', 'xlsx', 'docx', 'zip', 'png', 'jpg', 'jpeg'],
    mimeTypes: [...ALLOWED_MIME_TYPES],
    allowMimePrefixes: [],
  }),
});

/**
 * Multer's outcomes answered as the 4xx they are: the size limit is 413, a
 * refused type 415, any other multer complaint 400. Left to `next(err)` each
 * became a 500 at the generic handler.
 */
const receiveSingleFile = (req: any, res: any, next: any) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `The file exceeds the ${UPLOAD_MAX_BYTES / (1024 * 1024)} MB limit` });
      }
      return res.status(400).json({ error: `Upload rejected: ${err.message}` });
    }
    if (err instanceof Error && /Unsupported file type/i.test(err.message)) {
      return res.status(415).json({ error: 'Unsupported file type' });
    }
    return next(err);
  });
};

/**
 * The declared type must be one this router reads, and the bytes must be what
 * the type says (magic number, or printable text for text-shaped types) and
 * clean (malware scan; fails closed in production when no scan could run). The
 * check is the platform's one implementation, server/middleware/uploadSafety.ts;
 * this router kept its own copy of the signature logic until 2026-09-25.
 */
const validateUploadedFile = async (req: any, res: any, next: any) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return res.status(415).json({ error: 'Unsupported file type' });
  }
  try {
    await assertUploadSafe(file.buffer ?? Buffer.alloc(0), file.mimetype, file.originalname);
  } catch (err) {
    if (err instanceof UploadSafetyError) {
      return res.status(err.status).json(err.body);
    }
    return next(err);
  }
  return next();
};

// ─────────────────────────────────────────────────────────────────────────────
// Tenant-scoped DB access.
//
// SECURITY (docs/security/STABILITY_TENANT_ISOLATION_FINDING.md): every stab_*
// table is under the app's uniform `tenant_isolation_policy` (0021), keyed on the
// `app.current_tenant_id` session var. So EVERY query here must run on a connection
// that carries that var — otherwise RLS (RLS_ENFORCE=on) returns zero rows. This
// facade replaces the module pool: it derives the tenant from the request-scoped
// tenant ALS (populated by the tenantContext middleware — the same source req.user
// uses), sets the canonical RLS vars, and runs the query. It is FAIL-CLOSED: no
// tenant scope ⇒ throw, no query runs. Vars are set `is_local` inside a transaction
// so they are discarded at COMMIT and never persist onto a pooled connection (no
// stale-tenant leak). `app.rls_enforce` is set per-connection by the pool's connect
// handler (installRlsEnforcement), so it is already present on rawPool clients.
//
// The bespoke `set_config('app.tenant_id', …)` blocks this module used before were
// inert: that is not the var any policy reads, and the value was discarded (is_local
// with no surrounding transaction). Removed in favor of this facade.
// ─────────────────────────────────────────────────────────────────────────────
const rawPool = getPool();

async function withTenantClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const scope = getTenantScope();
  const tenantId = scope?.tenantId;
  // Fail-closed: a stability query with no tenant boundary must not run at all,
  // rather than run unscoped and rely on RLS returning nothing.
  if (!tenantId || !parseInt(String(tenantId), 10)) {
    throw new Error('Tenant context required');
  }
  const client = await rawPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [String(tenantId)]);
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [scope?.orgUuid ?? '']);
    await client.query(`SELECT set_config('app.current_user_role', $1, true)`, [scope?.role ?? '']);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Acquire a tenant-scoped client for handlers that manage their own multi-statement
 * transaction (BEGIN/COMMIT). The canonical RLS vars are set session-level and
 * cleared before the connection returns to the pool, so no stale tenant leaks onto
 * a pooled connection. Fail-closed: no tenant scope ⇒ throw.
 */
async function tenantConnect(): Promise<PoolClient> {
  const scope = getTenantScope();
  const tenantId = scope?.tenantId;
  if (!tenantId || !parseInt(String(tenantId), 10)) {
    throw new Error('Tenant context required');
  }
  const client = await rawPool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [String(tenantId)]);
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [scope?.orgUuid ?? '']);
    await client.query(`SELECT set_config('app.current_user_role', $1, false)`, [scope?.role ?? '']);
  } catch (err) {
    client.release();
    throw err;
  }
  // Clear the session vars before the connection is returned to the pool. The reset
  // is chained ahead of the real release so node-pg does not hand this connection to
  // another tenant with our vars still set.
  const origRelease = client.release.bind(client) as PoolClient['release'];
  (client as unknown as { release: (...a: unknown[]) => void }).release = (...args: unknown[]) => {
    void client
      .query(
        `SELECT set_config('app.current_tenant_id', '', false),
                set_config('app.current_org_id', '', false),
                set_config('app.current_user_role', '', false)`,
      )
      .catch(() => {})
      .finally(() => (origRelease as (...a: unknown[]) => void)(...args));
  };
  return client;
}

/**
 * Drop-in for the former `pool`. `.query()` runs a single statement in its own
 * tenant-scoped transaction (canonical RLS vars set is_local, discarded at COMMIT);
 * `.connect()` returns a tenant-scoped client for the handlers that run an explicit
 * BEGIN/COMMIT. Both derive the tenant from the request ALS and are fail-closed.
 */
const pool = {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    return withTenantClient((client) => client.query<T>(text, params));
  },
  connect: tenantConnect,
};

// Helper function for audit trail
/** The verified principal an audit record is attributed to, or '' — see audit(). */
function auditActor(req: any): string {
  return String(req.user?.email ?? req.user?.id ?? req.user?.userId ?? '');
}

async function audit(studyId: string, action: string, payload: any, req: any, tx: PoolClient) {
  // 21 CFR Part 11 §11.10(e) / ICH Q1A: the audit actor is the VERIFIED
  // principal. This read `x-user-name || x-user-email || 'user'` — both
  // client-supplied — so any authenticated caller could attribute a stability
  // audit record to anyone, and an omitted header recorded the literal string
  // "user", which identifies nobody. Tenant scope on this router was already
  // derived from the JWT (below); attribution was the half left on headers.
  // Same rule as the authoring router's getActorEmail: email, else the token
  // subject. See ledger C-18.
  const actor = auditActor(req);
  if (!actor) {
    throw new Error('Actor identity required for audit');
  }
  // Always inside the caller's transaction: the audit record and the change it
  // records commit together or not at all. Until 2026-09-23 the transaction was
  // optional and every handler but the study create wrote its audit record AFTER
  // its change had committed, on another connection — so a failed audit left a
  // committed, unaudited change and told the caller the change had failed
  // (docs/evidence/W2/2026-09-23/stability-audited-writes.txt).
  await tx.query(
    `INSERT INTO stab_audit (study_id, actor, action, payload_json) VALUES ($1,$2,$3,$4)`,
    [studyId, actor, action, JSON.stringify(payload)]
  );
}

/**
 * A refusal decided inside a transaction. Thrown, so the transaction rolls back
 * and nothing it wrote persists; answered with its own status by `fail`.
 */
class StabRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown
  ) {
    super(message);
  }
}

/** One answer for every failure on this router: a refusal says why, anything else is a 500. */
function fail(res: any, error: unknown, what: string) {
  if (error instanceof StabRefusal) {
    return res
      .status(error.status)
      .json(error.detail === undefined ? { error: error.message } : { error: error.message, detail: error.detail });
  }
  return serverError(res, logger, what, error);
}

/**
 * A model call that failed says so. The service functions returned canned
 * text on failure, which these routes answered 200 with; a refusal (unknown
 * study) keeps its own status.
 */
function aiFail(res: any, error: unknown, what: string) {
  if (error instanceof StabRefusal) return fail(res, error, what);
  logger.error(`stability model call failed while ${what}`, { error: String((error as any)?.message ?? error) });
  return res.status(502).json({ error: 'The model could not be reached; nothing was generated.' });
}

/** The first row, or a 404 refusal that rolls the transaction back. */
function found<T>(rows: T[], what: string): T {
  if (!rows[0]) throw new StabRefusal(404, `${what} not found`);
  return rows[0];
}

/**
 * The rows a condition or timepoint delete destroys by cascade: its timepoints
 * (for a condition) and every result under it, with values. Read before the
 * delete so the audit record can say what went.
 */
async function cascadeOf(tx: PoolClient, key: 'cond_id' | 'tp_id', id: string) {
  const cols = 'result_id, cond_id, tp_id, test_id, value, unit, pass, remarks, created_at';
  const results = (
    await tx.query(
      key === 'cond_id'
        ? `select ${cols} from stab_results where cond_id = $1 order by created_at`
        : `select ${cols} from stab_results where tp_id = $1 order by created_at`,
      [id]
    )
  ).rows;
  const timepoints =
    key === 'cond_id'
      ? (await tx.query(`select * from stab_timepoints where cond_id = $1 order by month`, [id])).rows
      : undefined;
  // stab_reminders.tp_id is ON DELETE CASCADE too.
  const reminders = (
    await tx.query(
      key === 'cond_id'
        ? `select r.* from stab_reminders r join stab_timepoints tp on tp.tp_id = r.tp_id where tp.cond_id = $1`
        : `select * from stab_reminders where tp_id = $1`,
      [id]
    )
  ).rows;
  return timepoints ? { timepoints, results, reminders } : { results, reminders };
}

/**
 * The study in the path, locked for update, if it is this tenant's; otherwise a
 * 404 that rolls the transaction back. Every write scoped to /studies/:id calls
 * this first. Foreign keys do not see RLS, and a child row takes the CALLER's
 * tenant_id by default, so before this a write naming another tenant's study_id
 * was accepted: conditions, CAPAs, assignments and audit records filed under a
 * study the caller could not read, and a 200/500 split that told any tenant
 * whether a UUID was a study anywhere (review of 2026-09-23, reproduced on the
 * reference database as the non-bypass role with RLS enforced). The tenant
 * predicate is explicit; RLS is the second line. The lock serialises writes to
 * one study, which the in-use, OOT-rule and sample-sequence writes rely on.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function ownStudy(
  tx: PoolClient,
  studyId: string,
  { lock = true }: { lock?: boolean } = {}
): Promise<Record<string, any> & { study_id: string; code: string; name: string }> {
  // Not a UUID ⇒ not a study (404), rather than a 22P02 cast error (500).
  // Compared as a uuid, so an upper-case id in the path names the same study.
  if (!UUID_RE.test(String(studyId))) throw new StabRefusal(404, 'study not found');
  const tenantId = parseInt(String(getTenantScope()?.tenantId ?? ''), 10);
  return found(
    (
      await tx.query(
        `select * from stab_studies where study_id = $1::uuid and tenant_id = $2${lock ? ' for update' : ''}`,
        [String(studyId), tenantId]
      )
    ).rows,
    'study'
  );
}

/**
 * A study's child row, addressed by its own id, if it is this tenant's:
 * located, then its study locked through ownStudy (study first — the order
 * every /studies/:id write takes, so two writes cannot deadlock), then the row
 * locked with an explicit tenant predicate. These routes locked and wrote by
 * the child id alone, leaving tenancy to RLS, which the router's own rule makes
 * the second line (review of 2026-09-23).
 */
const CHILD_KEY = {
  stab_conditions: 'cond_id',
  stab_timepoints: 'tp_id',
  stab_tests: 'test_id',
  stab_capa: 'capa_id',
  stab_assignments: 'assign_id',
  stab_samples: 'sample_id',
} as const;
async function ownChild(tx: PoolClient, table: keyof typeof CHILD_KEY, id: string, what: string): Promise<Record<string, any>> {
  if (!UUID_RE.test(String(id))) throw new StabRefusal(404, `${what} not found`);
  const tenantId = parseInt(String(getTenantScope()?.tenantId ?? ''), 10);
  const key = CHILD_KEY[table];
  const located = found(
    (await tx.query(`select study_id from ${table} where ${key} = $1::uuid and tenant_id = $2`, [id, tenantId])).rows,
    what
  );
  await ownStudy(tx, located.study_id);
  return found(
    (await tx.query(`select * from ${table} where ${key} = $1::uuid and tenant_id = $2 for update`, [id, tenantId])).rows,
    what
  );
}

/** A recorded value as a finite number, or null. '' and 'n/a' are not zero. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * The acceptance criterion a test RECORDS, in the shape the canonical engines
 * take (the same mapping recorded-stability's parser gives a range or a
 * one-sided limit). No recorded limit ⇒ null, and the engines refuse rather
 * than assume one.
 */
function criterionOf(test: { spec_low?: unknown; spec_high?: unknown }): ParsedAcceptanceCriterion | null {
  const lo = num(test.spec_low);
  const hi = num(test.spec_high);
  if (lo !== null && hi !== null && lo < hi) return { limit: lo, direction: 'decreasing', upperLimit: hi, twoSided: true };
  if (lo !== null && hi === null) return { limit: lo, direction: 'decreasing', upperLimit: null, twoSided: false };
  if (hi !== null && lo === null) return { limit: hi, direction: 'increasing', upperLimit: null, twoSided: false };
  return null;
}

/**
 * The study's numeric series, one per (test, storage condition), with the
 * test's recorded criterion. Non-numeric and missing values are counted, not
 * turned into anything.
 */
async function studySeries(tx: PoolClient, studyId: string, testName?: string) {
  const { rows } = await tx.query(
    `select t.test_id, t.name as test_name, t.unit as test_unit, t.spec_low, t.spec_high,
            c.kind as condition_kind, tp.month, tp.label, r.value
       from stab_results r
       join stab_tests t on t.test_id = r.test_id
       join stab_conditions c on c.cond_id = r.cond_id
       join stab_timepoints tp on tp.tp_id = r.tp_id
      where r.study_id = $1 and ($2::text is null or lower(t.name) = lower($2))
      order by t.name, c.kind, tp.month`,
    [studyId, testName || null]
  );
  const groups = new Map<string, any>();
  for (const r of rows) {
    const key = `${r.test_id}|${r.condition_kind}`;
    if (!groups.has(key)) {
      groups.set(key, {
        test_id: r.test_id,
        test_name: r.test_name,
        unit: r.test_unit,
        condition: r.condition_kind,
        criterion: criterionOf(r),
        points: [] as { time: number; value: number }[],
        nonNumeric: 0,
      });
    }
    const g = groups.get(key);
    const v = num(r.value);
    if (v === null) g.nonNumeric++;
    else g.points.push({ time: Number(r.month), value: v });
  }
  return [...groups.values()];
}

/** The study as recorded, with the deterministic assessments, for the model to narrate. */
async function studyContext(tx: PoolClient, studyId: string): Promise<StabilityContext> {
  const study = await ownStudy(tx, studyId, { lock: false });
  const q = async (sql: string) => (await tx.query(sql, [studyId])).rows;
  const [conditions, timepoints, tests, results] = [
    await q(`select kind, temp, rh, description from stab_conditions where study_id = $1 order by kind`),
    await q(
      `select tp.label, tp.month, tp.planned_date, tp.actual_date, c.kind as condition
         from stab_timepoints tp join stab_conditions c on c.cond_id = tp.cond_id
        where tp.study_id = $1 order by c.kind, tp.month`
    ),
    await q(`select name, unit, spec_low, spec_high, is_cqa from stab_tests where study_id = $1 order by name`),
    await q(
      `select t.name as test, c.kind as condition, tp.label as timepoint, tp.month, r.value, r.unit, r.pass
         from stab_results r
         join stab_tests t on t.test_id = r.test_id
         join stab_conditions c on c.cond_id = r.cond_id
         join stab_timepoints tp on tp.tp_id = r.tp_id
        where r.study_id = $1 order by t.name, c.kind, tp.month`
    ),
  ];
  const assessments = (await studySeries(tx, studyId)).map(g => ({
    test: g.test_name,
    condition: g.condition,
    nonNumericResults: g.nonNumeric,
    outOfTrend: assessTrend(g.points, g.criterion),
  }));
  return { study, conditions, timepoints, tests, results, assessments };
}

/** The upload's CSV rows with the line each starts on. Blank and delimiter-only rows (",,,") are skipped. */
function readCsv(buffer: Buffer): { line: number; record: Record<string, string> }[] {
  const rows = parse(buffer.toString('utf8'), {
    columns: (header: string[]) => header.map(h => h.trim().toLowerCase()),
    skip_empty_lines: true,
    skip_records_with_empty_values: true,
    trim: true,
    bom: true,
    info: true,
  }) as { record: Record<string, string>; info: { lines: number } }[];
  return rows.map(r => ({ line: r.info.lines, record: r.record }));
}

/**
 * pass as recorded: true, false, or null when not stated. Any other word is
 * refused — 'Pass', 'P', 'Conforms' and the like became NULL silently.
 */
const PASS_WORDS: Record<string, boolean> = {
  '1': true, true: true, y: true, yes: true, pass: true, passed: true, p: true, conforms: true, complies: true,
  '0': false, false: false, n: false, no: false, fail: false, failed: false, f: false, 'does not conform': false, 'does not comply': false,
};
function passOf(v: unknown): boolean | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  const w = String(v).trim().toLowerCase();
  return w in PASS_WORDS ? PASS_WORDS[w] : undefined;
}

/**
 * These routes read or write stab_results columns — status, reviewed_by,
 * reviewed_at, reject_reason, sample_id — that only
 * db/migrations/_legacy/031_stability_workflow.sql and
 * _legacy/035_stability_sample_link_coc.sql add. Neither is on any applier, so on
 * every deployed database each of these routes failed with 42703 (review failed
 * without an answer at all). They say so instead. Making result review real is
 * schema work for the CMC workstream, outside the launch catalog (CLAUDE.md
 * RULE 2), and an approval needs the Part 11 signing path, as the sign-off route
 * below records.
 */
function resultReviewUnavailable(_req: any, res: any) {
  return res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message:
      'Result review and result-to-sample linking are not available: the result workflow columns do not exist on this database. Nothing was changed.',
  });
}

/**
 * Record one result against a study. Keys may be ids or the human keys
 * (cond_kind, label, test_name); either way each must belong to THIS study — an
 * id from another study was accepted before and filed the result under a
 * condition, timepoint or test the study does not have. Returns the inserted row,
 * or the reason the row was refused. Shared by POST /results and the CSV import.
 */
async function insertResult(tx: PoolClient, studyId: string, b: any): Promise<any | string> {
  const one = async (sql: string, v: unknown) =>
    v === undefined || v === null || v === '' ? undefined : (await tx.query(sql, [studyId, String(v)])).rows[0];
  const cond =
    (await one(`select cond_id from stab_conditions where study_id=$1 and cond_id::text=$2`, b.cond_id)) ??
    (await one(`select cond_id from stab_conditions where study_id=$1 and kind=upper($2) limit 1`, b.cond_kind));
  const tp =
    (await one(`select tp_id from stab_timepoints where study_id=$1 and tp_id::text=$2`, b.tp_id)) ??
    (b.label === undefined || b.label === null || b.label === ''
      ? undefined
      : (
          await tx.query(
            `select tp_id from stab_timepoints
              where study_id=$1 and upper(label)=upper($2) and ($3::uuid is null or cond_id=$3::uuid)
              order by month limit 1`,
            [studyId, String(b.label), cond?.cond_id ?? null]
          )
        ).rows[0]);
  const test =
    (await one(`select test_id from stab_tests where study_id=$1 and test_id::text=$2`, b.test_id)) ??
    (await one(`select test_id from stab_tests where study_id=$1 and lower(name)=lower($2) limit 1`, b.test_name));
  if (!cond || !tp || !test) {
    return 'cond_id/tp_id/test_id (or cond_kind/label/test_name) of this study required';
  }
  const pass = passOf(b.pass);
  if (pass === undefined) return `pass "${String(b.pass)}" is not a recognised pass/fail value`;
  // A blank value is no value (NULL), not the empty string: '' broke every
  // numeric read of the tenant's results (/oot-surveillance cast it to float).
  const value = b.value === undefined || b.value === null || String(b.value).trim() === '' ? null : String(b.value).trim();
  const { rows } = await tx.query(
    `insert into stab_results (study_id,cond_id,tp_id,test_id,value,unit,pass,raw_json)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [studyId, cond.cond_id, tp.tp_id, test.test_id, value, b.unit || null, pass, JSON.stringify(b)]
  );
  return rows[0];
}

// Every write on this router is attributable or it does not happen. Checked
// before any handler takes a connection, so an unsigned request writes nothing:
// before this, an unsigned PATCH /conditions or POST /results committed its
// change and then failed on the audit record, leaving the change unaudited.
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!auditActor(req)) return res.status(401).json({ error: 'Actor identity required' });
  return next();
});

// GET /api/stability/studies - List all studies
router.get('/studies', async (req, res) => {
  const client = await pool.connect();
  try {
    // Set tenant context for RLS policies — derive from JWT-validated context, not raw headers
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    // SET commands don't support parameterized queries, but set_config() does
    const safetenantId = parseInt(tenantId.toString());
    if (!safetenantId) {
      return res.status(401).json({ error: 'Invalid tenant ID' });
    }
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safetenantId)]);

    const result = await client.query(`
      SELECT
        s.*,
        COUNT(DISTINCT c.cond_id) as condition_count,
        COUNT(DISTINCT tp.tp_id) as timepoint_count,
        COUNT(DISTINCT t.test_id) as test_count
      FROM stab_studies s
      LEFT JOIN stab_conditions c ON s.study_id = c.study_id
      LEFT JOIN stab_timepoints tp ON s.study_id = tp.study_id
      LEFT JOIN stab_tests t ON s.study_id = t.study_id
      GROUP BY s.study_id
      ORDER BY s.created_at DESC
    `);

    const rows = result.rows;

    // fetch one-line condition strings per study for frontend compatibility
    const ids = rows.map((r: any) => r.study_id);
    const condMap = new Map<string, string[]>();
    if (ids.length) {
      // Use the same client with tenant context
      const { rows: conds } = await client.query(
        `select study_id, kind, temp, rh from stab_conditions where study_id = any($1)`,
        [ids]
      );
      conds.forEach((c: any) => {
        const arr = condMap.get(c.study_id) || [];
        arr.push(`${c.kind}: ${c.temp}${c.rh ? '/' + c.rh : ''}`);
        condMap.set(c.study_id, arr);
      });
    }

    // Progress from the timepoints as recorded: sampled = has an actual date.
    // These were a constant 45 %, '0M' and '3M' for every study.
    const progress = new Map<string, any>();
    if (ids.length) {
      const { rows: tp } = await client.query(
        `select study_id,
                count(*)::int as total,
                count(*) filter (where actual_date is not null)::int as sampled,
                (array_agg(label order by month desc) filter (where actual_date is not null))[1] as last_label,
                (array_agg(label order by month) filter (where actual_date is null))[1] as next_label
           from stab_timepoints where study_id = any($1) group by study_id`,
        [ids]
      );
      tp.forEach((t: any) => progress.set(t.study_id, t));
    }

    // Add compatibility fields for frontend
    const out = rows.map((r: any) => ({
      ...r,
      product_name: r.name,
      batch_number: r.code,
      storage_condition: (condMap.get(r.study_id) || []).join('; '),
      progress_percent: progress.get(r.study_id)?.total
        ? Math.round((100 * progress.get(r.study_id).sampled) / progress.get(r.study_id).total)
        : null,
      last_timepoint: progress.get(r.study_id)?.last_label ?? null,
      next_timepoint: progress.get(r.study_id)?.next_label ?? null,
      latest_assay_result: null,
      latest_impurities_result: null,
      latest_water_result: null,
    }));

    res.json(out);
  } catch (error: any) {
    console.error('Error fetching stability studies:', error);
    return serverError(res, logger, 'loading studies', error);
  } finally {
    // Always release the connection back to the pool
    client.release();
  }
});

// POST /api/stability/studies - Create new study with AI planning
router.post('/studies', async (req, res) => {
  // Validate before taking a connection or opening a transaction, so a rejected
  // request never holds a pooled client.
  const mappedStatus = toStabStudyStatus(req.body?.status);
  if (mappedStatus === null) {
    return res.status(400).json({ error: 'Invalid status', allowed: Object.keys(STAB_STUDY_STATUS) });
  }
  const requestedConditions: unknown = req.body?.storageConditions;
  if (
    !Array.isArray(requestedConditions) ||
    requestedConditions.some(c => !(String(c) in STAB_PLANNED_CONDITIONS))
  ) {
    return res.status(400).json({
      error: 'Invalid storageConditions',
      allowed: Object.keys(STAB_PLANNED_CONDITIONS),
    });
  }
  // Part 11 §11.10(e): a study is not created without an attributable audit
  // record, so the actor is required before anything is written.
  if (!auditActor(req)) {
    return res.status(401).json({ error: 'Actor identity required' });
  }
  const tenantIdRaw = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  const safeTenantIdEarly = tenantIdRaw ? parseInt(tenantIdRaw.toString(), 10) : NaN;
  if (!tenantIdRaw || !safeTenantIdEarly) {
    return res.status(401).json({ error: 'Tenant context required' });
  }

  const client = await pool.connect();

  try {
    const {
      productName,
      batchNumber,
      dosageForm,
      strength,
      scope,
      climaticZone,
      storageConditions,
      duration,
      testParameters,
      startDate,
      notes,
    } = req.body;

    // Tenant from JWT-validated context, checked above BEFORE the transaction
    // opens (an early return after BEGIN used to leave it open on a pooled client).
    const tenantId = tenantIdRaw;
    const safeTenantId = safeTenantIdEarly;

    // Start transaction
    await client.query('BEGIN');

    // Set tenant context for RLS policies - use parameterized set_config()
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safeTenantId)]);

    // Generate dates
    const plannedEndDate = new Date(startDate);
    plannedEndDate.setMonth(plannedEndDate.getMonth() + duration);

    // Insert the main study record - let database generate the UUID
    const studyResult = await client.query(
      `INSERT INTO stab_studies (
        product_id, name, code, dosage_form, strength,
        duration_months, scope, climatic_zone,
        start_date, status, tenant_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
      )
      RETURNING *`,
      [
        productName, // product_id field stores the product name
        productName, // name field also stores the product name
        batchNumber, // code field stores the batch number
        dosageForm,
        strength,
        duration,
        scope || 'Standard',
        climaticZone || null, // not recorded is not Zone IVa
        startDate,
        mappedStatus,
        tenantId,
      ]
    );

    const study = studyResult.rows[0];

    // Insert storage conditions
    const conditions = [];
    for (const cond of storageConditions) {
      const condResult = await client.query(
        `INSERT INTO stab_conditions (study_id, kind, temp, rh, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          study.study_id, // Use the generated UUID from the study
          cond,
          STAB_PLANNED_CONDITIONS[cond].temp,
          STAB_PLANNED_CONDITIONS[cond].rh,
          `${cond} storage condition`,
        ]
      );
      conditions.push(condResult.rows[0]);
    }

    // Generate timepoints based on duration and ICH guidelines
    const timepointLabels = ['0M'];
    if (duration >= 3) timepointLabels.push('3M');
    if (duration >= 6) timepointLabels.push('6M');
    if (duration >= 9) timepointLabels.push('9M');
    if (duration >= 12) timepointLabels.push('12M');
    if (duration >= 18) timepointLabels.push('18M');
    if (duration >= 24) timepointLabels.push('24M');
    if (duration >= 36) timepointLabels.push('36M');

    // Insert timepoints for each condition
    const timepoints = [];
    for (const condition of conditions) {
      for (const tp of timepointLabels) {
        const month = parseInt(tp.replace('M', ''));
        const plannedDate = new Date(startDate);
        plannedDate.setMonth(plannedDate.getMonth() + month);

        const tpResult = await client.query(
          `INSERT INTO stab_timepoints (study_id, cond_id, label, month, planned_date)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            study.study_id,
            condition.cond_id, // Associate timepoint with this condition
            tp,
            month,
            plannedDate.toISOString().split('T')[0],
          ]
        );
        timepoints.push(tpResult.rows[0]);
      }
    }

    // Insert test parameters. A test is a name, or { name, unit?, spec_low?,
    // spec_high?, is_cqa? }. Nothing is filled in: this set Assay to 95–105 %,
    // Water Content to NMT 5 %, every other unit to 'Various' and CQA status by
    // name — acceptance criteria no one entered, which OOT, validation and P.8
    // then treated as the product's specification.
    const tests = [];
    for (const raw of Array.isArray(testParameters) ? testParameters : []) {
      const test = typeof raw === 'string' ? { name: raw } : (raw ?? {});
      const testResult = await client.query(
        `INSERT INTO stab_tests (
          study_id,
          name,
          unit,
          spec_low,
          spec_high,
          is_cqa
        )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          study.study_id,
          String(test.name ?? ''),
          test.unit ?? null,
          test.spec_low ?? null,
          test.spec_high ?? null,
          // The column's own default: every test is treated as critical until
          // someone records otherwise.
          test.is_cqa ?? true,
        ]
      );
      tests.push(testResult.rows[0]);
    }

    // Audit the creation INSIDE the transaction. It ran after COMMIT on its own
    // connection, so an audit failure left a committed, unaudited study while
    // the caller was told the create failed.
    await audit(
      study.study_id,
      'CREATE_STUDY',
      {
        productName,
        batchNumber,
        scope,
        duration,
        climaticZone: climaticZone || null,
        conditions: conditions.map(c => ({ kind: c.kind, temp: c.temp, rh: c.rh })),
        timepoints: timepointLabels,
        tests: tests.map(t => ({ name: t.name, unit: t.unit, spec_low: t.spec_low, spec_high: t.spec_high, is_cqa: t.is_cqa })),
      },
      req,
      client
    );

    // Commit transaction
    await client.query('COMMIT');

    // Prepare response
    const newStudy = {
      ...study,
      id: study.study_id, // Use the generated UUID from the study
      product_name: productName,
      batch_number: batchNumber,
      storage_conditions: storageConditions.join(', '),
      test_parameters: testParameters,
      timepoints: timepointLabels,
      study_status: study.status, // what was stored, not a recomputation
      compliance_status: 'Not Started',
      latest_timepoint: null, // nothing is sampled at creation
      latest_assay_result: null,
      latest_impurities_result: null,
      latest_water_result: null,
    };

    res.status(201).json({
      message: 'Study created successfully',
      study: newStudy,
      plan: {
        conditions: conditions.map(c => ({
          kind: c.kind,
          temp: c.temp,
          rh: c.rh,
          description: c.description,
        })),
        timepoints: timepoints.map(tp => ({
          label: tp.label,
          month: tp.month,
          planned_date: tp.planned_date,
        })),
        tests: tests.map(t => ({
          name: t.name,
          unit: t.unit,
          spec_low: t.spec_low,
          spec_high: t.spec_high,
          is_cqa: t.is_cqa,
        })),
      },
    });
  } catch (error: any) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Error creating study:', error);
    return serverError(res, logger, 'saving studies', error);
  } finally {
    // Always release the connection
    client.release();
  }
});

// PUT /api/stability/studies/:id and PATCH /api/stability/studies/:id/status
//
// Both used to answer "updated successfully" and echo the request back while
// writing NOTHING — a fabricated record of a change to a GxP stability study.
// No client calls either. Until a real, audited update exists they say so:
// 501, and the body states that nothing was changed.
router.put('/studies/:id', (_req, res) => {
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Updating a stability study is not implemented. Nothing was changed.',
  });
});

router.patch('/studies/:id/status', (_req, res) => {
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Changing a stability study status is not implemented. Nothing was changed.',
  });
});

// GET /api/stability/studies/:id - Get study details
router.get('/studies/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Set tenant context for RLS policies — derive from JWT-validated context, not raw headers
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const safeTenantId = parseInt(tenantId.toString());
    if (!safeTenantId) {
      return res.status(401).json({ error: 'Invalid tenant ID' });
    }
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safeTenantId)]);

    // Get study
    const studyResult = await client.query('SELECT * FROM stab_studies WHERE study_id = $1', [id]);
    if (studyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Study not found' });
    }
    const study = studyResult.rows[0];

    // Get conditions
    const conditionsResult = await client.query(
      'SELECT * FROM stab_conditions WHERE study_id = $1 ORDER BY kind',
      [id]
    );
    const conditions = conditionsResult.rows;

    // Get timepoints
    const timepointsResult = await client.query(
      'SELECT * FROM stab_timepoints WHERE study_id = $1 ORDER BY month',
      [id]
    );
    const timepoints = timepointsResult.rows;

    // Get tests
    const testsResult = await client.query(
      'SELECT * FROM stab_tests WHERE study_id = $1 ORDER BY name',
      [id]
    );
    const tests = testsResult.rows;

    // Get results
    const resultsResult = await client.query(
      `
      SELECT r.*, c.kind as condition_kind, tp.label as timepoint_label, t.name as test_name
      FROM stab_results r
      JOIN stab_conditions c ON r.cond_id = c.cond_id
      JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
      JOIN stab_tests t ON r.test_id = t.test_id
      WHERE r.study_id = $1
      ORDER BY c.kind, tp.month, t.name
    `,
      [id]
    );
    const results = resultsResult.rows;

    res.json({
      study: {
        ...study,
        product_name: study.name,
        batch_number: study.code,
      },
      conditions,
      timepoints,
      tests,
      results,
      storage_condition: conditions
        .map((x: any) => `${x.kind}: ${x.temp}${x.rh ? '/' + x.rh : ''}`)
        .join('; '),
    });
  } catch (error: any) {
    console.error('Error fetching study details:', error);
    return serverError(res, logger, 'loading studies', error);
  } finally {
    client.release();
  }
});

// POST /api/stability/studies/:id/conditions - Add condition
router.post('/studies/:id/conditions', async (req, res) => {
  try {
    const { id } = req.params;
    const { kind, temp, rh, description } = req.body || {};
    const row = await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const { rows } = await tx.query(
        `INSERT INTO stab_conditions (study_id, kind, temp, rh, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, kind, temp, rh, description]
      );
      await audit(id, 'condition_add', rows[0], req, tx);
      return rows[0];
    });
    res.json(row);
  } catch (error) {
    return fail(res, error, 'saving conditions');
  }
});

// DELETE /api/stability/conditions/:condId - Delete condition
router.delete('/conditions/:condId', async (req, res) => {
  try {
    const { condId } = req.params;
    await withTenantClient(async tx => {
      // Its timepoints and their results go with it (ON DELETE CASCADE). The
      // audit record keeps all of them: it kept only the condition row, so the
      // result values a delete destroyed were recorded nowhere.
      await ownChild(tx, 'stab_conditions', condId, 'condition');
      const cascaded = await cascadeOf(tx, 'cond_id', condId);
      const removed = (await tx.query(`DELETE FROM stab_conditions WHERE cond_id = $1 RETURNING *`, [condId])).rows[0];
      await audit(removed.study_id, 'condition_delete', { removed, ...cascaded }, req, tx);
    });
    res.json({ success: true });
  } catch (error) {
    return fail(res, error, 'deleting conditions');
  }
});

// POST /api/stability/studies/:id/timepoints - Add timepoint
router.post('/studies/:id/timepoints', async (req, res) => {
  try {
    const { id } = req.params;
    const { label, month, planned_date } = req.body || {};
    const timepoints = await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const conditions = (
        await tx.query('SELECT cond_id FROM stab_conditions WHERE study_id = $1', [id])
      ).rows;
      if (!conditions.length) {
        throw new StabRefusal(409, 'The study has no storage conditions to add a timepoint to');
      }
      const added = [];
      for (const condition of conditions) {
        const { rows } = await tx.query(
          `INSERT INTO stab_timepoints (study_id, cond_id, label, month, planned_date)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [id, condition.cond_id, label, month, planned_date]
        );
        added.push(rows[0]);
      }
      await audit(id, 'tp_add', { label, month, planned_date, count: added.length }, req, tx);
      return added;
    });
    res.json(timepoints);
  } catch (error) {
    return fail(res, error, 'adding timepoint');
  }
});

// POST /api/stability/studies/:id/timepoints/:tpId/sample - Set actual sampling date
router.post('/studies/:id/timepoints/:tpId/sample', async (req, res) => {
  try {
    const { id, tpId } = req.params;
    const { actual_date } = req.body || {};
    const row = await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const before = found(
        (
          await tx.query(
            `SELECT actual_date FROM stab_timepoints WHERE tp_id = $1 AND study_id = $2 FOR UPDATE`,
            [tpId, id]
          )
        ).rows,
        'timepoint'
      );
      const { rows } = await tx.query(
        `UPDATE stab_timepoints SET actual_date = $1 WHERE tp_id = $2 AND study_id = $3 RETURNING *`,
        [actual_date, tpId, id]
      );
      await audit(
        id,
        'tp_actual_date',
        { tpId, before: before.actual_date, after: rows[0].actual_date },
        req,
        tx
      );
      return rows[0];
    });
    res.json(row);
  } catch (error) {
    return fail(res, error, 'updating sampling date');
  }
});

// POST /api/stability/studies/:id/schedule - Build ICS calendar + reminders
router.post('/studies/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params;

    // The study, its planned timepoints, the reminders and their audit record in
    // one transaction. An unknown study was a TypeError on study.name (500);
    // the reminders were written with no record.
    const { study, timepointsResult } = await withTenantClient(async tx => {
      const study = await ownStudy(tx, id);
      const timepointsResult = await tx.query(
        `SELECT tp.*, c.kind as condition_kind
           FROM stab_timepoints tp
           JOIN stab_conditions c ON tp.cond_id = c.cond_id
          WHERE tp.study_id = $1 AND tp.planned_date IS NOT NULL
          ORDER BY tp.planned_date`,
        [id]
      );
      let created = 0;
      for (const tp of timepointsResult.rows) {
        const r = await tx.query(
          `INSERT INTO stab_reminders (study_id, tp_id, due_date, channel)
           VALUES ($1, $2, $3, 'ICS')
           ON CONFLICT DO NOTHING`,
          [id, tp.tp_id, tp.planned_date]
        );
        created += r.rowCount ?? 0;
      }
      await audit(id, 'schedule_reminders', { timepoints: timepointsResult.rows.length, reminders_created: created }, req, tx);
      return { study, timepointsResult };
    });

    // Generate ICS content
    const icsEvents = timepointsResult.rows.map(tp => {
      const date = new Date(tp.planned_date);
      const dateStr = date.toISOString().replace(/[-:]/g, '').split('T')[0];

      return [
        'BEGIN:VEVENT',
        `UID:stability-${tp.tp_id}@stability-system`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `SUMMARY:Stability Sampling - ${study.name} (${tp.condition_kind} ${tp.label})`,
        `DESCRIPTION:Stability study sampling for ${study.name}\\nCondition: ${tp.condition_kind}\\nTimepoint: ${tp.label}`,
        'END:VEVENT',
      ].join('\r\n');
    });

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Stability System//EN',
      ...icsEvents,
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${study.code}-sampling-calendar.ics"`
    );
    res.send(icsContent);
  } catch (error) {
    return fail(res, error, 'generating schedule');
  }
});

// POST /api/stability/studies/:id/results/import - Import CSV results
//
// Columns are the POST /results keys: cond_id|cond_kind, tp_id|label,
// test_id|test_name, value, unit, pass. All or nothing: a file with any row this
// study cannot place is refused whole, with the rows and reasons, and nothing is
// written. This answered 200 "temporarily unavailable" with imported: 0 — a
// failure presented as a result — and did so after BEGIN, returning the pooled
// connection with its transaction still open.
router.post(
  '/studies/:id/results/import',
  receiveSingleFile,
  validateUploadedFile,
  async (req, res) => {
    const id = req.params.id as string;
    const csvData = req.file?.buffer.toString('utf8');
    if (!csvData) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    let records: { line: number; record: Record<string, string> }[];
    try {
      records = readCsv(req.file!.buffer);
    } catch (error: any) {
      return res.status(400).json({ error: 'The file is not valid CSV', detail: String(error?.message ?? error) });
    }
    if (!records.length) {
      return res.status(400).json({ error: 'The file has no result rows' });
    }
    try {
      const imported = await withTenantClient(async tx => {
        await ownStudy(tx, id);
        const refused: { line: number; error: string }[] = [];
        const created: any[] = [];
        for (const { line, record } of records) {
          const outcome = await insertResult(tx, id, record);
          if (typeof outcome === 'string') refused.push({ line, error: outcome });
          else created.push(outcome);
        }
        if (refused.length) {
          throw new StabRefusal(422, 'No results were imported: some rows cannot be placed in this study', refused);
        }
        // The values created, not only their count.
        await audit(
          id,
          'results_import',
          {
            file: req.file?.originalname ?? null,
            count: created.length,
            results: created.map(r => ({
              result_id: r.result_id, cond_id: r.cond_id, tp_id: r.tp_id, test_id: r.test_id,
              value: r.value, unit: r.unit, pass: r.pass,
            })),
          },
          req,
          tx
        );
        return created.length;
      });
      res.json({ imported });
    } catch (error) {
      return fail(res, error, 'importing results');
    }
  }
);

// GET /api/stability/studies/:id/trends - Get trend data for charts and sparklines
router.get('/studies/:id/trends', async (req, res) => {
  try {
    const { id } = req.params;
    const test = req.query.test as string;
    const cond = req.query.cond as string;

    let query = `
      SELECT
        r.value, r.unit, r.created_at,
        tp.month, tp.label as timepoint,
        c.kind as condition, c.temp,
        t.name as test_name
      FROM stab_results r
      JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
      JOIN stab_conditions c ON r.cond_id = c.cond_id
      JOIN stab_tests t ON r.test_id = t.test_id
      WHERE r.study_id = $1
    `;

    const params = [id];

    if (test) {
      query += ' AND t.name = $' + (params.length + 1);
      params.push(test);
    }

    if (cond) {
      query += ' AND c.kind = $' + (params.length + 1);
      params.push(cond);
    }

    query += ' ORDER BY c.kind, tp.month';

    const result = await pool.query(query, params);
    const trendData = result.rows;

    // Numeric results only: a missing or non-numeric value was plotted as 0.
    const sparklineData = trendData
      .map(row => ({ month: row.month, value: num(row.value), label: row.timepoint, condition: row.condition }))
      .filter(p => p.value !== null);

    // Direction of the recorded change, within ONE condition only (across
    // conditions it compares a 25 °C point with a 40 °C one). It was 'stable'
    // for any change under 0.5 in whatever unit the test uses, a verdict with no
    // basis; the change is reported and its sign named.
    const conditionsSeen = new Set(sparklineData.map(p => p.condition));
    const change =
      conditionsSeen.size === 1 && sparklineData.length >= 2
        ? (sparklineData[sparklineData.length - 1].value as number) - (sparklineData[0].value as number)
        : null;

    res.json({
      raw: trendData,
      sparkline: sparklineData,
      summary: {
        count: trendData.length,
        latest_value: trendData.length > 0 ? trendData[trendData.length - 1].value : null,
        numeric_count: sparklineData.length,
        change,
        trend_direction: change === null ? null : change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'unchanged',
        last_updated: trendData.length > 0 ? trendData[trendData.length - 1].created_at : null,
      },
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// GET /api/stability/studies/:id/results - Get results for study
router.get('/studies/:id/results', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        r.result_id as id,
        r.study_id,
        r.value,
        r.unit,
        r.pass,
        r.created_at,
        t.test_name,
        c.kind as condition,
        tp.month as timepoint
      FROM stab_results r
      JOIN stab_tests t ON r.test_id = t.test_id
      JOIN stab_conditions c ON r.cond_id = c.cond_id
      JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
      WHERE r.study_id = $1
      ORDER BY t.test_name, c.kind, tp.month
    `,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// PATCH and DELETE /api/stability/studies/results/:id — REMOVED 2026-09-23.
// Second copies of PATCH/DELETE /results/:resultId (below), which are the
// canonical, audited paths. This PATCH also set created_at = NOW() on every edit,
// erasing when a result was first recorded, and nulled any field not sent. No
// client called either copy.

// GET /api/stability/studies/:id/validate - Validate study design
router.get('/studies/:id/validate', async (req, res) => {
  try {
    const { id } = req.params;

    const errors = [];
    const warnings = [];

    // Check for required conditions
    const conditionsResult = await pool.query('SELECT * FROM stab_conditions WHERE study_id = $1', [
      id,
    ]);
    const conditions = conditionsResult.rows;

    const hasLT = conditions.some(c => c.kind === 'LT');
    const hasACC = conditions.some(c => c.kind === 'ACC');

    if (!hasLT) {
      errors.push({
        id: 'Q1A-001',
        message: 'Long-term (LT) condition is required per ICH Q1A(R2)',
      });
    }

    if (!hasACC) {
      errors.push({
        id: 'Q1A-002',
        message: 'Accelerated (ACC) condition is required per ICH Q1A(R2)',
      });
    }

    // Check timepoints
    const timepointsResult = await pool.query(
      'SELECT DISTINCT month FROM stab_timepoints WHERE study_id = $1 ORDER BY month',
      [id]
    );
    const months = timepointsResult.rows.map(tp => tp.month);

    if (!months.includes(0)) {
      errors.push({ id: 'Q1A-003', message: 'Initial timepoint (0M) is required' });
    }

    if (hasLT && !months.includes(12)) {
      warnings.push({
        id: 'Q1A-W001',
        message: 'Consider adding 12M timepoint for long-term studies',
      });
    }

    // Check tests
    const testsResult = await pool.query('SELECT * FROM stab_tests WHERE study_id = $1', [id]);
    const tests = testsResult.rows;

    if (tests.length === 0) {
      errors.push({ id: 'Q1A-004', message: 'At least one test parameter is required' });
    }

    const unlinkedTests = tests.filter(t => !t.method_id);
    if (unlinkedTests.length > 0) {
      warnings.push({
        id: 'Q1A-W002',
        message: `${unlinkedTests.length} tests are not linked to analytical methods`,
      });
    }

    res.json({ errors, warnings });
  } catch (error) {
    console.error('Error validating study:', error);
    res.status(500).json({ error: 'Failed to validate study' });
  }
});

// POST /api/stability/studies/:id/p8/push - Push P.8 to authoring with tokens
router.post('/studies/:id/p8/push', async (req, res) => {
  try {
    const { id } = req.params;

    // Get study data
    const [studyResult, condsResult, testsResult, resultsResult] = await Promise.all([
      pool.query(`SELECT * FROM stab_studies WHERE study_id = $1`, [id]),
      pool.query(`SELECT * FROM stab_conditions WHERE study_id = $1`, [id]),
      pool.query(`SELECT * FROM stab_tests WHERE study_id = $1 ORDER BY name`, [id]),
      pool.query(
        `
        SELECT r.*, c.kind as condition_kind, tp.label as timepoint_label, t.name as test_name
        FROM stab_results r
        JOIN stab_conditions c ON r.cond_id = c.cond_id
        JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
        JOIN stab_tests t ON r.test_id = t.test_id
        WHERE r.study_id = $1
        ORDER BY t.name, c.kind, tp.month
      `,
        [id]
      ),
    ]);

    if (!studyResult.rows[0]) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const study = studyResult.rows[0];
    const conds = condsResult.rows;
    const tests = testsResult.rows;
    const results = resultsResult.rows;

    // Generate P.8 tokens for authoring
    const tokens = {
      STUDY_NAME: study.name,
      STUDY_CODE: study.code,
      // Unrecorded study facts are marked as such, not filled in: these were
      // 'Zone II', 24 months and "Store in a dry place at room temperature",
      // stored in stab_exports and pushed into the authoring markdown.
      CLIMATIC_ZONE: study.climatic_zone || '[NOT RECORDED: climatic zone]',
      STORAGE_CONDITIONS: conds
        .map((c: any) => `${c.kind}: ${c.temp}${c.rh ? '/' + c.rh : ''}`)
        .join('; '),
      TEST_PARAMETERS: tests
        .map((t: any) => `${t.name}${t.unit ? ' (' + t.unit + ')' : ''}`)
        .join(', '),
      DURATION_MONTHS: study.duration_months ?? '[NOT RECORDED: duration]',
      LABEL_STORAGE: study.label_storage || '[NOT RECORDED: label storage statement]',
      // Do not certify a compliance verdict in a regulated submission document:
      // conformance to ICH Q1A(R2) is determined by evaluating completed results
      // against acceptance criteria, which this token generator does not do.
      // State the study's design basis instead of asserting "Compliant".
      COMPLIANCE_STATUS:
        'Study designed to follow ICH Q1A(R2); conformance to be confirmed against acceptance criteria on completion',
      RESULTS_SUMMARY:
        results.length > 0 ? `${results.length} test results recorded` : 'Testing in progress',
    };

    // Generate markdown content
    const markdown = `## 3.2.P.8 Stability Summary

**Study:** ${tokens.STUDY_NAME} (${tokens.STUDY_CODE})

**Storage Conditions:** ${tokens.STORAGE_CONDITIONS}

**Climatic Zone:** ${tokens.CLIMATIC_ZONE}

**Duration:** ${tokens.DURATION_MONTHS} months

**Test Parameters:** ${tokens.TEST_PARAMETERS}

**Label Storage Conditions:** ${tokens.LABEL_STORAGE}

**Compliance:** ${tokens.COMPLIANCE_STATUS}

**Results Status:** ${tokens.RESULTS_SUMMARY}

### Stability Protocol Summary
This stability study follows ICH Q1A(R2) guidelines for ${tokens.CLIMATIC_ZONE} climatic conditions. Testing includes ${tests.length} parameters across ${conds.length} storage conditions over ${tokens.DURATION_MONTHS} months.

### Storage and Labeling
Recommended label storage: ${tokens.LABEL_STORAGE}
`;

    // Store the export record and its audit record together.
    await withTenantClient(async tx => {
      await ownStudy(tx, id);
      await tx.query(
      `
      -- Column names corrected: the table declares tokens / markdown /
      -- created_at (db/migrations/030_stability_results.sql), not tokens_json /
      -- markdown_content / generated_at. All three were unknown columns, so
      -- pushing P.8 content to authoring recorded nothing and 42703'd on every
      -- call. created_at is omitted rather than passed NOW() — it already
      -- defaults to it. Found by ci:insert-columns-declared.
      INSERT INTO stab_exports (study_id, export_type, tokens, markdown)
      VALUES ($1, 'p8_authoring', $2, $3)
    `,
      [id, JSON.stringify(tokens), markdown]
      );
      await audit(id, 'p8_push_authoring', { tokens_count: Object.keys(tokens).length }, req, tx);
    });

    res.json({
      ok: true,
      tokens,
      markdown,
      message: 'P.8 content pushed to authoring successfully',
    });
  } catch (error) {
    return fail(res, error, 'pushing P.8 to authoring');
  }
});

// POST /api/stability/studies/:id/p8/refresh - Refresh P.8 tokens for document authoring
router.post('/studies/:id/p8/refresh', async (req, res) => {
  try {
    const { id } = req.params;

    // Get study data
    const studyResult = await pool.query('SELECT * FROM stab_studies WHERE study_id = $1', [id]);
    const study = studyResult.rows[0];

    // Get latest results summary
    const resultsResult = await pool.query(
      `
      SELECT
        c.kind, tp.label, t.name, r.value, r.unit
      FROM stab_results r
      JOIN stab_conditions c ON r.cond_id = c.cond_id
      JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
      JOIN stab_tests t ON r.test_id = t.test_id
      WHERE r.study_id = $1
      ORDER BY c.kind, tp.month, t.name
    `,
      [id]
    );

    // Generate tokens for document authoring
    const tokens = {
      '[PRODUCT_NAME]': study.name,
      '[STUDY_CODE]': study.code,
      '[DOSAGE_FORM]': study.dosage_form || 'Not specified',
      '[STRENGTH]': study.strength || 'Not specified',
      '[CLIMATIC_ZONE]': study.climatic_zone || '[NOT RECORDED: climatic zone]', // was 'IVb'
      '[DURATION]': `${study.duration_months} months`,
      '[STATUS]': study.status,
      '[RESULTS_SUMMARY]': resultsResult.rows
        .map(r => `${r.kind} ${r.label}: ${r.name} = ${r.value} ${r.unit || ''}`)
        .join('; '),
    };

    res.json({ tokens });
  } catch (error) {
    console.error('Error refreshing P.8 tokens:', error);
    res.status(500).json({ error: 'Failed to refresh P.8 tokens' });
  }
});

// PATCH /api/stability/tests/:testId - Update a test's method link and/or spec limits
//
// Only the fields sent change; a field sent as null clears it. This wrote all
// three from the body, so linking a method (the only field the second copy of
// this route, now removed, ever sent) set both specification limits to NULL.
const TEST_FIELDS = ['method_id', 'spec_low', 'spec_high'] as const;
router.patch('/tests/:testId', async (req, res) => {
  try {
    const { testId } = req.params;
    const body = req.body || {};
    const fields = TEST_FIELDS.filter(f => Object.prototype.hasOwnProperty.call(body, f));
    if (!fields.length) {
      return res.status(400).json({ error: 'Nothing to update', allowed: TEST_FIELDS });
    }
    const row = await withTenantClient(async tx => {
      const before = await ownChild(tx, 'stab_tests', testId, 'test');
      const { rows } = await tx.query(
        `UPDATE stab_tests SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')}
         WHERE test_id = $1 RETURNING *`,
        [testId, ...fields.map(f => body[f] ?? null)]
      );
      await audit(
        before.study_id,
        'test_update',
        {
          testId,
          before: Object.fromEntries(fields.map(f => [f, before[f]])),
          after: Object.fromEntries(fields.map(f => [f, rows[0][f]])),
        },
        req,
        tx
      );
      return rows[0];
    });
    res.json(row);
  } catch (error) {
    return fail(res, error, 'updating test');
  }
});

// STEP 4: Inline editing endpoints

// PATCH /api/stability/conditions/:condId - Update condition inline
router.patch('/conditions/:condId', async (req, res) => {
  try {
    const condId = req.params.condId;
    const { kind, temp, rh, description } = req.body || {};
    await withTenantClient(async tx => {
      const before = await ownChild(tx, 'stab_conditions', condId, 'condition');
      const { rows } = await tx.query(
        `UPDATE stab_conditions
            SET kind = COALESCE($2, kind),
                temp = COALESCE($3, temp),
                rh = COALESCE($4, rh),
                description = COALESCE($5, description)
          WHERE cond_id = $1
          RETURNING *`,
        [condId, kind || null, temp || null, rh || null, description || null]
      );
      await audit(before.study_id, 'condition_update', { condId, before, after: rows[0] }, req, tx);
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'updating condition');
  }
});

// PATCH /api/stability/timepoints/:tpId - Update timepoint inline
router.patch('/timepoints/:tpId', async (req, res) => {
  try {
    const tpId = req.params.tpId;
    const { label, month, planned_date } = req.body || {};
    await withTenantClient(async tx => {
      const before = await ownChild(tx, 'stab_timepoints', tpId, 'timepoint');
      const { rows } = await tx.query(
        `UPDATE stab_timepoints
            SET label = COALESCE($2, label),
                month = COALESCE($3, month),
                planned_date = COALESCE($4::date, planned_date)
          WHERE tp_id = $1
          RETURNING *`,
        // '' is "not sent" for every field here; month 0 is a month.
        [tpId, label || null, month === '' || month === undefined || month === null ? null : month, planned_date || null]
      );
      await audit(before.study_id, 'tp_update', { tpId, before, after: rows[0] }, req, tx);
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'updating timepoint');
  }
});

// DELETE /api/stability/timepoints/:tpId - Delete timepoint
router.delete('/timepoints/:tpId', async (req, res) => {
  try {
    const tpId = req.params.tpId;
    await withTenantClient(async tx => {
      await ownChild(tx, 'stab_timepoints', tpId, 'timepoint');
      // Its results go with it (ON DELETE CASCADE); the record keeps them.
      const cascaded = await cascadeOf(tx, 'tp_id', tpId);
      const removed = (await tx.query(`DELETE FROM stab_timepoints WHERE tp_id = $1 RETURNING *`, [tpId])).rows[0];
      await audit(removed.study_id, 'tp_delete', { tpId, removed, ...cascaded }, req, tx);
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'deleting timepoint');
  }
});

// In-Use workflow endpoints

// GET /api/stability/studies/:id/inuse - Get in-use configuration
router.get('/studies/:id/inuse', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM stab_inuse WHERE study_id = $1 LIMIT 1`, [id]);
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching in-use config:', error);
    res.status(500).json({ error: 'Failed to fetch in-use config' });
  }
});

// POST /api/stability/studies/:id/inuse - Update in-use configuration
router.post('/studies/:id/inuse', async (req, res) => {
  try {
    const id = req.params.id;
    const {
      multi_dose,
      opened_frequency,
      hold_time_days,
      microbial_limits,
      preservative,
      start_on,
    } = req.body || {};
    const values = [
      !!multi_dose,
      opened_frequency || null,
      hold_time_days === '' || hold_time_days === undefined ? null : hold_time_days,
      microbial_limits || null,
      preservative || null,
      start_on || null,
    ];

    // One in-use configuration per study. This was `ON CONFLICT (study_id)`, and
    // stab_inuse has no unique constraint on study_id on any deployed database,
    // so every save failed (42P10). The study row is locked instead, which
    // serialises concurrent saves for the study without new schema.
    await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const before = (await tx.query(`SELECT * FROM stab_inuse WHERE study_id = $1`, [id])).rows[0] ?? null;
      const { rows } = before
        ? await tx.query(
            `UPDATE stab_inuse SET multi_dose = $2, opened_frequency = $3, hold_time_days = $4,
                    microbial_limits = $5, preservative = $6, start_on = $7, updated_at = now()
              WHERE study_id = $1 RETURNING *`,
            [id, ...values]
          )
        : await tx.query(
            `INSERT INTO stab_inuse (study_id, multi_dose, opened_frequency, hold_time_days,
                                     microbial_limits, preservative, start_on, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING *`,
            [id, ...values]
          );
      await audit(id, 'inuse_update', { before, after: rows[0] }, req, tx);
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'updating in-use config');
  }
});

// OOT/OOS surveillance endpoints

// GET /api/stability/studies/:id/oot/rules - Get OOT rules
router.get('/studies/:id/oot/rules', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query(
      `SELECT rule_id, test_id, rules FROM stab_oot_rules WHERE study_id = $1`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching OOT rules:', error);
    res.status(500).json({ error: 'Failed to fetch OOT rules' });
  }
});

// POST /api/stability/studies/:id/oot/rules - Set OOT rules
router.post('/studies/:id/oot/rules', async (req, res) => {
  try {
    const id = req.params.id;
    const { test_id, rules } = req.body || {};
    const testId = test_id || null;

    // One rule set per (study, test), the study-wide set being test_id NULL —
    // the key idx_stab_oot_rules_unique indexes. This was `ON CONFLICT ON
    // CONSTRAINT stab_oot_rules_study_unique`, a constraint no migration creates,
    // so every save failed (42704). Update-or-insert under the study row lock.
    await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const before =
        (
          await tx.query(
            `SELECT rules FROM stab_oot_rules WHERE study_id = $1 AND test_id IS NOT DISTINCT FROM $2::uuid`,
            [id, testId]
          )
        ).rows[0]?.rules ?? null;
      const json = JSON.stringify(rules || []);
      if (before !== null) {
        await tx.query(
          `UPDATE stab_oot_rules SET rules = $3 WHERE study_id = $1 AND test_id IS NOT DISTINCT FROM $2::uuid`,
          [id, testId, json]
        );
      } else {
        await tx.query(`INSERT INTO stab_oot_rules (study_id, test_id, rules) VALUES ($1, $2, $3)`, [
          id,
          testId,
          json,
        ]);
      }
      await audit(id, 'oot_rules_update', { test_id: testId, before, after: rules || [] }, req, tx);
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'updating OOT rules');
  }
});

// GET /api/stability/studies/:id/oot/check - Check for OOT violations
router.get('/studies/:id/oot/check', async (req, res) => {
  try {
    const id = req.params.id;
    const testName = String(req.query.test || '').toLowerCase();

    const testResult = await pool.query(
      `SELECT test_id FROM stab_tests WHERE study_id = $1 AND LOWER(name) = $2`,
      [id, testName]
    );
    if (!testResult.rows[0]) {
      return res.json({ breaches: [], rules: [] });
    }

    const rulesResult = await pool.query(
      `
      SELECT rules FROM stab_oot_rules
      WHERE study_id = $1 AND (test_id = $2 OR test_id IS NULL)
      ORDER BY test_id NULLS LAST LIMIT 1`,
      [id, testResult.rows[0].test_id]
    );
    const rules = rulesResult.rows[0]?.rules || ['WE1', 'WE2'];

    const dataResult = await pool.query(
      `
      SELECT t.month, r.value::float as v, c.kind
      FROM stab_results r
      JOIN stab_timepoints t ON t.tp_id = r.tp_id
      JOIN stab_conditions c ON c.cond_id = r.cond_id
      WHERE r.study_id = $1 AND r.test_id = $2 AND r.value ~ '^[0-9.]+$'
      ORDER BY t.month`,
      [id, testResult.rows[0].test_id]
    );

    // Simple Western Electric rules implementation
    const byCond: Record<string, number[]> = {};
    dataResult.rows.forEach((p: any) => {
      (byCond[p.kind] ||= []).push(p.v);
    });

    function mean(a: number[]): number {
      return a.reduce((s, v) => s + v, 0) / a.length;
    }
    function sd(a: number[]): number {
      const m = mean(a);
      return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1 || 1));
    }

    const breaches: any[] = [];
    for (const [cond, series] of Object.entries(byCond)) {
      if (series.length < 5) continue;
      const m = mean(series),
        s = sd(series);
      const we: any = {};

      // WE1: any beyond 3σ
      if (rules.includes('WE1') && series.some(v => v > m + 3 * s || v < m - 3 * s)) we.WE1 = true;

      // WE2: 2 of 3 beyond 2σ
      if (rules.includes('WE2')) {
        for (let i = 2; i < series.length; i++) {
          const w = series.slice(i - 2, i + 1);
          const count = w.filter(v => v > m + 2 * s).length + w.filter(v => v < m - 2 * s).length;
          if (count >= 2) {
            we.WE2 = true;
            break;
          }
        }
      }

      if (Object.keys(we).length) breaches.push({ cond, we });
    }

    res.json({ rules, breaches });
  } catch (error) {
    console.error('Error checking OOT:', error);
    res.status(500).json({ error: 'Failed to check OOT' });
  }
});

// P.8 export endpoint
// POST /api/stability/studies/:id/p8/export?fmt=pdf|docx
router.post('/studies/:id/p8/export', async (req, res) => {
  try {
    const id = req.params.id;
    const fmt = (req.query.fmt as string) || 'pdf';

    const [studyResult, condsResult, tpsResult, testsResult] = await Promise.all([
      pool.query(`SELECT * FROM stab_studies WHERE study_id = $1`, [id]),
      pool.query(`SELECT * FROM stab_conditions WHERE study_id = $1`, [id]),
      pool.query(`SELECT * FROM stab_timepoints WHERE study_id = $1 ORDER BY month`, [id]),
      pool.query(`SELECT * FROM stab_tests WHERE study_id = $1 ORDER BY name`, [id]),
    ]);

    if (!studyResult.rows[0]) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const study = studyResult.rows[0];
    const conds = condsResult.rows;
    const tps = tpsResult.rows;
    const tests = testsResult.rows;

    // Compose P.8 content
    const p8Content = [
      `3.2.P.8 Stability Summary`,
      ``,
      `Study: ${study.name} (${study.code})`,
      `Zone: ${study.climatic_zone || '—'}; Duration: ${study.duration_months} months`,
      ``,
      `Conditions: ${conds
        .map((c: any) => `${c.kind}: ${c.temp}${c.rh ? '/' + c.rh : ''}`)
        .join('; ')}`,
      `Timepoints: ${tps.map((t: any) => t.label).join(', ')}`,
      `Tests: ${tests.map((t: any) => `${t.name}${t.unit ? ' (' + t.unit + ')' : ''}`).join(', ')}`,
      ``,
      `Label storage: ${study.label_storage || 'TBD'}`,
    ].join('\n');

    // Record the export before any byte of it leaves. It was audited after the
    // response had been sent, so an audit failure could not be reported and the
    // export went unrecorded.
    const exportFmt = fmt === 'pdf' ? 'pdf' : 'txt';
    await withTenantClient(async tx => {
      await ownStudy(tx, id);
      await audit(id, 'p8_export', { fmt: exportFmt }, req, tx);
    });

    if (exportFmt === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="P8_${study.code}.pdf"`);

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 54, bottom: 54, left: 54, right: 54 },
      });
      doc.pipe(res);
      doc.fontSize(16).text('3.2.P.8 Stability Summary', { underline: true });
      doc.moveDown();
      doc.fontSize(11).text(p8Content);
      doc.end();
    } else {
      // Return as text for now (ZIP functionality temporarily disabled)
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="P8_${study.code}.txt"`);
      res.send(p8Content);
    }
  } catch (error) {
    if (res.headersSent) {
      logger.error('P.8 export failed after the response began', { error: String((error as any)?.message ?? error) });
      return res.end();
    }
    return fail(res, error, 'exporting P.8');
  }
});

// GET /api/stability/studies/:id/audit - Get audit trail
router.get('/studies/:id/audit', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT event_id, actor, action, payload_json, created_at
      FROM stab_audit
      WHERE study_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching audit trail:', error);
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

// AI Services endpoints
router.post('/studies/:id/ai/explain', async (req, res) => {
  try {
    const ctx = await withTenantClient(tx => studyContext(tx, req.params.id));
    const explanation = await aiExplainStability(ctx);
    res.json({ explanation, grounded_on: { results: ctx.results.length, assessments: ctx.assessments.length } });
  } catch (error) {
    return aiFail(res, error, 'explaining the study');
  }
});

router.get('/studies/:id/ai/coach', async (req, res) => {
  try {
    const ctx = await withTenantClient(tx => studyContext(tx, req.params.id));
    const priorities = await aiCoachPriorities(ctx);
    res.json({ priorities, grounded_on: { results: ctx.results.length, assessments: ctx.assessments.length } });
  } catch (error) {
    return aiFail(res, error, 'prioritising the study');
  }
});

router.post('/studies/:id/ai/fix', async (req, res) => {
  try {
    const ctx = await withTenantClient(tx => studyContext(tx, req.params.id));
    const fixPlan = await aiFixPlanFromIssues(ctx, req.body?.issues);
    res.json({ fixPlan, grounded_on: { results: ctx.results.length, assessments: ctx.assessments.length } });
  } catch (error) {
    return aiFail(res, error, 'drafting a fix plan');
  }
});

router.post('/studies/:id/ai/draft-p8', async (req, res) => {
  try {
    const ctx = await withTenantClient(tx => studyContext(tx, req.params.id));
    const draft = await aiDraftP8(ctx);
    res.json({ draft, grounded_on: { results: ctx.results.length, assessments: ctx.assessments.length } });
  } catch (error) {
    return aiFail(res, error, 'drafting P.8');
  }
});

router.post('/studies/:id/ai/root-cause', async (req, res) => {
  try {
    const ctx = await withTenantClient(tx => studyContext(tx, req.params.id));
    const analysis = await aiRootCauseOOS(ctx, req.body?.oosData);
    res.json({ analysis, grounded_on: { results: ctx.results.length, assessments: ctx.assessments.length } });
  } catch (error) {
    return aiFail(res, error, 'analysing the OOS');
  }
});

router.post('/studies/:id/ai/label', (_req, res) => {
  // RETIRED 2026-09-23. This asked a model to "recommend the labelled storage
  // conditions and shelf life based on the stability data" while passing it only
  // the study id — no data — and wrote what came back into stab_studies.
  // label_storage, unaudited: an object (serialised as JSON) on success, and the
  // "temporarily unavailable" placeholder text on failure. label_storage feeds the
  // P.8 push and export tokens. A shelf life and label statement are conclusions
  // from ICH Q1E evaluation of the study's results, a deterministic calculation
  // (GET /studies/:id/ai/t90, server/services/cmc/shelf-life.ts) and a human
  // decision; a model does not supply them
  // (CLAUDE.md RULE 2). Nothing was changed.
  res.status(410).json({
    error: 'STABILITY_LABEL_RECOMMENDATION_RETIRED',
    message:
      'Label storage is not set from a model recommendation. The ICH Q1E shelf-life estimate from this study\'s results is GET /studies/:id/ai/t90?test=<name>; the label statement is a reviewed decision. Nothing was changed.',
  });
});

// GET /studies/:id/ai/t90?test=<name>&condition=LT
//
// The ICH Q1E shelf-life estimate from the study's OWN recorded results for one
// test at one storage condition (long-term by default), against the limit the
// test records: server/services/cmc/shelf-life.ts, the platform's one Q1E
// engine. This returned a constant — 61.5 months, "high — supports a 24-month
// shelf life claim" — for any study and any id (simpleShelfLifeT90, removed).
router.get('/studies/:id/ai/t90', async (req, res) => {
  const testName = String(req.query.test ?? '').trim();
  const condition = String(req.query.condition ?? 'LT').toUpperCase();
  if (!testName) return res.status(400).json({ error: 'test required (the test name as recorded)' });
  try {
    const series = await withTenantClient(async tx => {
      await ownStudy(tx, req.params.id, { lock: false });
      return (await studySeries(tx, req.params.id, testName)).find(g => g.condition === condition) ?? null;
    });
    if (!series) {
      return res.status(422).json({ error: `No results recorded for ${testName} at ${condition}` });
    }
    if (!series.criterion) {
      return res.status(422).json({ error: `${testName} records no acceptance criterion; a shelf life cannot be estimated against an assumed one` });
    }
    let estimate;
    try {
      estimate = estimateShelfLife({
        data: series.points,
        specLimit: series.criterion.limit,
        direction: series.criterion.direction,
      });
    } catch (error: any) {
      // Too few points, or no variation in time: the engine says which.
      return res.status(422).json({ error: 'Shelf life not estimated', detail: String(error?.message ?? error) });
    }
    res.json({
      test: series.test_name,
      condition,
      criterion: series.criterion,
      pointsUsed: series.points.length,
      nonNumericResults: series.nonNumeric,
      estimate,
    });
  } catch (error) {
    return fail(res, error, 'estimating shelf life');
  }
});

// --- OOT surveillance ---
//
// One method, the platform's: the PhRMA regression control chart in
// server/services/cmc/stability-trending.ts, against each test's RECORDED
// acceptance criterion. This router had its own "Western Electric" check with
// thresholds relaxed to 2.5σ / 1.5σ / 3-of-4 / 5-in-a-row while still calling
// them WE1–WE4, and it filled each flagged item with a specification limit it
// invented (mean ± 3 SD), investigator 'System' and a closure date 30 days out.
// The study-scoped alias returned the study's raw results. A signal here is a
// detection for review; investigation state, owner and dates belong to a CAPA.
async function ootItems(tx: PoolClient, studyIds: string[], testName?: string) {
  const items: any[] = [];
  for (const studyId of studyIds) {
    for (const g of await studySeries(tx, studyId, testName)) {
      const assessment = assessTrend(g.points, g.criterion);
      items.push({
        study_id: studyId,
        test: g.test_name,
        condition: g.condition,
        unit: g.unit,
        nonNumericResults: g.nonNumeric,
        assessment,
        signal: assessment.ok ? assessment.outOfTrend.length > 0 : null,
      });
    }
  }
  return items;
}

// ALIAS 1: across the tenant's studies (optional study filter)
// GET /api/stability/oot-surveillance?studyId=<uuid>&test=<name>
router.get('/oot-surveillance', async (req, res) => {
  const studyId = String(req.query.studyId ?? '');
  const testName = String(req.query.test ?? '') || undefined;
  try {
    const items = await withTenantClient(async tx => {
      const ids = studyId
        ? [(await ownStudy(tx, studyId, { lock: false })).study_id]
        : (await tx.query(`select study_id from stab_studies order by name`)).rows.map((r: any) => r.study_id);
      return ootItems(tx, ids, testName);
    });
    res.json({ method: OOT_METHOD, items });
  } catch (error) {
    return fail(res, error, 'performing OOT surveillance');
  }
});

// ALIAS 2: study-scoped
// GET /api/stability/studies/:id/oot/surveillance?test=<name>
router.get('/studies/:id/oot/surveillance', async (req, res) => {
  const testName = String(req.query.test ?? '') || undefined;
  try {
    const items = await withTenantClient(async tx => {
      await ownStudy(tx, req.params.id, { lock: false });
      return ootItems(tx, [req.params.id], testName);
    });
    res.json({ method: OOT_METHOD, items });
  } catch (error) {
    return fail(res, error, 'performing OOT surveillance');
  }
});

// --- Results entry endpoints ---
// POST /api/stability/studies/:id/results
// body can use either *_id or human keys: { cond_id|cond_kind, tp_id|label, test_id|test_name, value, unit?, pass? }
router.post('/studies/:id/results', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    const row = await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const outcome = await insertResult(tx, id, b);
      if (typeof outcome === 'string') throw new StabRefusal(400, outcome);
      await audit(
        id,
        'result_add',
        {
          result_id: outcome.result_id,
          cond_id: outcome.cond_id,
          tp_id: outcome.tp_id,
          test_id: outcome.test_id,
          value: outcome.value,
        },
        req,
        tx
      );
      return outcome;
    });
    res.json({ ok: true, result_id: row.result_id });
  } catch (error) {
    return fail(res, error, 'creating result');
  }
});

/**
 * The tenant's own result, locked for update inside the caller's transaction,
 * or null. The predicate is stab_results.tenant_id, the integer the
 * tenant-isolation migration keeps on every stab_* row; RLS is the second
 * line, not the first. Audit finding IAM-11 (plan P1-8): PATCH and DELETE
 * below wrote by result_id alone, answered ok whether or not a row existed,
 * and recorded nothing, while result_add beside them audits.
 */
type StabResultRow = { result_id: string; study_id: string; value: string | null; unit: string | null; pass: boolean | null; remarks: string | null };
async function ownResultForUpdate(client: PoolClient, resultId: string, tenantId: number): Promise<StabResultRow | null> {
  const { rows } = await client.query<StabResultRow>(
    `select result_id, study_id, value, unit, pass, remarks from stab_results where result_id=$1 and tenant_id=$2 for update`,
    [resultId, tenantId]
  );
  return rows[0] ?? null;
}

/** The request's tenant as the integer the stab_* rows carry, or null. */
function requestTenantId(req: any): number | null {
  const raw = getTenantScope()?.tenantId ?? req.tenantId ?? req.tenantContext?.organizationId;
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The fields a result change names, and nothing it does not. */
function resultChangesOf(b: any): Partial<Pick<StabResultRow, 'value' | 'unit' | 'pass' | 'remarks'>> {
  const out: Partial<Pick<StabResultRow, 'value' | 'unit' | 'pass' | 'remarks'>> = {};
  if (b.value !== undefined) out.value = b.value;
  if (b.unit !== undefined) out.unit = b.unit;
  if (b.pass !== undefined) out.pass = b.pass;
  if (b.remarks !== undefined) out.remarks = b.remarks;
  return out;
}

const previousOf = (r: StabResultRow) => ({ value: r.value, unit: r.unit, pass: r.pass, remarks: r.remarks });

// PATCH /api/stability/results/:resultId  { value?, unit?, pass?, remarks?, reason? }
// One transaction: the tenant's own row read for update, the change, and the
// audit record carrying the previous values (21 CFR 11.10(e)).
router.patch('/results/:resultId', async (req, res) => {
  const rid = String(req.params.resultId);
  const tenantId = requestTenantId(req);
  if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });
  const changes = resultChangesOf(req.body || {});
  try {
    await withTenantClient(async tx => {
      const previous = await ownResultForUpdate(tx, rid, tenantId);
      if (!previous) throw new StabRefusal(404, 'Result not found');
      const after = (
        await tx.query<StabResultRow>(
          `update stab_results set value=coalesce($3,value), unit=coalesce($4,unit), pass=coalesce($5,pass), remarks=coalesce($6,remarks)
            where result_id=$1 and tenant_id=$2
            returning result_id, study_id, value, unit, pass, remarks`,
          [rid, tenantId, changes.value ?? null, changes.unit ?? null, changes.pass ?? null, changes.remarks ?? null]
        )
      ).rows[0];
      // `changes` is what was asked; `after` is what the row became. They differ
      // where a field was sent as null, which leaves the recorded value in place
      // — the audit record said otherwise when it held only `changes`.
      await audit(
        previous.study_id,
        'result_update',
        { resultId: rid, previous: previousOf(previous), changes, after: previousOf(after), reason: req.body?.reason ?? null },
        req,
        tx
      );
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'updating result');
  }
});

// DELETE /api/stability/results/:resultId
// One transaction: the tenant's own row read for update, the deletion, and the
// audit record of what was deleted.
router.delete('/results/:resultId', async (req, res) => {
  const rid = String(req.params.resultId);
  const tenantId = requestTenantId(req);
  if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });
  try {
    await withTenantClient(async tx => {
      const previous = await ownResultForUpdate(tx, rid, tenantId);
      if (!previous) throw new StabRefusal(404, 'Result not found');
      await tx.query(`delete from stab_results where result_id=$1 and tenant_id=$2`, [rid, tenantId]);
      await audit(
        previous.study_id,
        'result_delete',
        { resultId: rid, previous: previousOf(previous), reason: req.body?.reason ?? null },
        req,
        tx
      );
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'deleting result');
  }
});

// ============= STEP 6: WORKFLOW & AI AUTOMATIONS =============

// GET /studies/:id/results/pending and POST /results/:resultId/review
// { status: 'REVIEWED'|'APPROVED'|'REJECTED', reason? } — see resultReviewUnavailable.
router.get('/studies/:id/results/pending', resultReviewUnavailable);
router.post('/results/:resultId/review', resultReviewUnavailable);

// GET /studies/:id/capa
router.get('/studies/:id/capa', async (req, res) => {
  try {
    const { rows } = await pool.query<any>(
      `select * from stab_capa where study_id=$1 order by created_at desc`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching CAPA records:', error);
    res.status(500).json({ error: 'Failed to fetch CAPA records' });
  }
});

// POST /studies/:id/capa  { title, why?, actions[], owner?, due_date?, linked_result_id?, linked_oot? }
router.post('/studies/:id/capa', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'title required' });
    const row = await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const { rows } = await tx.query(
      `insert into stab_capa (study_id,title,why,actions,owner,due_date,status,linked_result_id,linked_oot)
       values ($1,$2,$3,$4,$5,$6,'OPEN',$7,$8) returning *`,
      [
        id,
        b.title,
        b.why || null,
        // jsonb: node-pg would send a JS array as a Postgres array literal.
        JSON.stringify(b.actions || []),
        b.owner || null,
        b.due_date || null,
        b.linked_result_id || null,
        b.linked_oot || null,
      ]
      );
      await audit(id, 'capa_create', rows[0], req, tx);
      return rows[0];
    });
    res.json(row);
  } catch (error) {
    return fail(res, error, 'creating CAPA');
  }
});

// PATCH /capa/:id  { status?, owner?, due_date?, actions? }
router.patch('/capa/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    await withTenantClient(async tx => {
      // An unknown CAPA answered { ok: true } having changed nothing.
      const before = await ownChild(tx, 'stab_capa', id, 'CAPA');
      const { rows } = await tx.query(
        `update stab_capa set status=coalesce($2,status), owner=coalesce($3,owner), due_date=coalesce($4::date,due_date), actions=coalesce($5,actions), updated_at=now()
          where capa_id=$1 returning *`,
        [id, b.status || null, b.owner || null, b.due_date || null, b.actions ? JSON.stringify(b.actions) : null]
      );
      await audit(before.study_id, 'capa_update', { capa_id: id, before, after: rows[0] }, req, tx);
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'updating CAPA');
  }
});

// POST /studies/:id/excursions/import
// CSV columns: timestamp, metric (TEMP|RH), value, low, high, duration_min?
//
// Until 2026-09-23 this ignored the uploaded file and inserted two hard-coded
// rows (26.5 °C and 28.2 °C on 2025-01-28) into the study's excursion record,
// timestamped now(), whatever the upload said — fabricated storage excursions in
// a GxP record. It now reads the file, refuses it whole if any row is unusable,
// and records each excursion at the time the file gives.
const EXCURSION_METRICS = new Set(['TEMP', 'RH']);
router.post(
  '/studies/:id/excursions/import',
  receiveSingleFile,
  validateUploadedFile,
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'csv missing' });
    const id = req.params.id as string;
    let records: { line: number; record: Record<string, string> }[];
    try {
      records = readCsv(req.file.buffer);
    } catch (error: any) {
      return res.status(400).json({ error: 'The file is not valid CSV', detail: String(error?.message ?? error) });
    }
    if (!records.length) return res.status(400).json({ error: 'The file has no excursion rows' });

    const refused: { line: number; error: string }[] = [];
    const readings = records.map(({ line, record: r }) => {
      const ts = new Date(r.timestamp ?? '');
      const metric = String(r.metric || '').toUpperCase();
      const val = num(r.value);
      const lo = num(r.low);
      const hi = num(r.high);
      const duration = r.duration_min === undefined || r.duration_min === '' ? null : Number(r.duration_min);
      const problems = [
        isNaN(ts.getTime()) && 'timestamp is not a date',
        !EXCURSION_METRICS.has(metric) && 'metric must be TEMP or RH',
        val === null && 'value is not a number',
        lo === null && 'low is not a number',
        hi === null && 'high is not a number',
        lo !== null && hi !== null && lo > hi && 'low is above high',
        duration !== null && !(Number.isInteger(duration) && duration >= 0) && 'duration_min is not a whole number of minutes',
      ].filter(Boolean) as string[];
      if (problems.length) refused.push({ line, error: problems.join('; ') });
      return { ts: isNaN(ts.getTime()) ? null : ts.toISOString(), metric, val, lo, hi, duration, raw: r };
    });
    if (refused.length) {
      return res
        .status(422)
        .json({ error: 'No excursions were imported: some rows are not usable', detail: refused });
    }
    // An excursion is a reading OUTSIDE its limits. A logger file carries every
    // reading; the in-limit ones were stored as "MINOR" excursions. Severity is
    // not classified here: it was set by an arbitrary 3-unit rule, and grading a
    // storage excursion is a quality decision. The deviation is recorded instead.
    const excursions = readings
      .filter(r => (r.val as number) < (r.lo as number) || (r.val as number) > (r.hi as number))
      .map(r => ({
        ...r,
        deviation: (r.val as number) > (r.hi as number) ? (r.val as number) - (r.hi as number) : (r.val as number) - (r.lo as number),
      }));

    try {
      const inserted = await withTenantClient(async tx => {
        await ownStudy(tx, id);
        for (const r of excursions) {
          await tx.query(
            `insert into stab_excursions (study_id,ts,metric,value,limit_low,limit_high,duration_min,severity,raw_json)
             values ($1,$2,$3,$4,$5,$6,$7,NULL,$8)`,
            [id, r.ts, r.metric, r.val, r.lo, r.hi, r.duration, JSON.stringify({ ...r.raw, deviation: r.deviation })]
          );
        }
        await audit(
          id,
          'excursions_import',
          {
            file: req.file?.originalname ?? null,
            readings: readings.length,
            excursions: excursions.map(e => ({ ts: e.ts, metric: e.metric, value: e.val, low: e.lo, high: e.hi, duration_min: e.duration })),
          },
          req,
          tx
        );
        return excursions.length;
      });
      res.json({ readings: readings.length, inserted, withinLimits: readings.length - inserted });
    } catch (error) {
      return fail(res, error, 'importing excursions');
    }
  }
);

// GET /protocols
router.get('/protocols', async (_req, res) => {
  try {
    const { rows } = await pool.query<any>(
      `select proto_id,name,product_scope from stab_protocols order by created_at desc`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching protocols:', error);
    res.status(500).json({ error: 'Failed to fetch protocols' });
  }
});

// POST /protocols  { name, product_scope?, payload_json }
router.post('/protocols', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.payload_json)
      return res.status(400).json({ error: 'name,payload_json required' });
    const row = await withTenantClient(async tx => {
      const { rows } = await tx.query(
        `insert into stab_protocols (name,product_scope,payload_json) values ($1,$2,$3) returning *`,
        [b.name, b.product_scope || null, b.payload_json]
      );
      // Organisation-level, so the platform audit trail rather than stab_audit
      // (keyed by study). Written before COMMIT and required: if it cannot be
      // persisted the template is not created. (The one ordering that remains —
      // recorded, then the COMMIT fails — over-records; it never under-records.)
      const recorded = await logAuditEvent({
        category: 'data_change',
        severity: 'info',
        action: 'stability_protocol_create',
        userId: auditActor(req),
        organizationId: String(getTenantScope()?.tenantId ?? ''),
        resourceType: 'stab_protocol',
        resourceId: rows[0].proto_id,
        newValue: { name: rows[0].name, product_scope: rows[0].product_scope, payload_json: rows[0].payload_json },
        success: true,
      });
      if (!recorded.persisted) throw new StabRefusal(503, 'The audit trail is unavailable; the protocol was not created');
      return rows[0];
    });
    res.json(row);
  } catch (error) {
    return fail(res, error, 'creating protocol');
  }
});

// POST /studies/:id/apply-protocol  { proto_id }
router.post('/studies/:id/apply-protocol', async (req, res) => {
  try {
    const id = req.params.id;
    const pid = req.body?.proto_id;
    // One transaction: a protocol is applied whole, with its audit record, or not
    // at all. Each insert used to commit on its own, so a failure part-way left a
    // study with some of the protocol's conditions, timepoints and tests.
    await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const proto = found(
        (await tx.query(`select payload_json from stab_protocols where proto_id=$1`, [pid])).rows,
        'protocol'
      );
      const p = proto.payload_json || {};

      const written: { conditions: any[]; timepoints: any[]; tests: any[] } = { conditions: [], timepoints: [], tests: [] };
      for (const c of p.conditions || []) {
        // stab_conditions has no unique (study, kind), so "on conflict do
        // nothing" never fired and a second apply duplicated every condition.
        const { rows } = await tx.query(
          `insert into stab_conditions (study_id,kind,temp,rh,description)
           select $1,$2,$3,$4,$5
            where not exists (select 1 from stab_conditions where study_id = $1 and kind = $2)
           returning *`,
          [id, c.kind, c.temp, c.rh || null, c.description || null]
        );
        written.conditions.push(...rows);
      }
      const conds = (await tx.query(`select * from stab_conditions where study_id=$1`, [id])).rows;
      const findCond = (k: string) => conds.find((c: any) => c.kind === k);

      for (const t of p.timepoints || []) {
        // A timepoint belongs to the condition it names. It fell back to the
        // study's first condition, filing a 40 °C pull under 25 °C.
        const cid = findCond(t.kind)?.cond_id;
        if (!cid) {
          throw new StabRefusal(422, `The protocol has a ${t.label} timepoint for condition ${t.kind}, which this study does not have`);
        }
        // Planned from the study's own start date, not from the day the protocol
        // was applied. $4 is both the integer month and the interval: untyped,
        // Postgres deduces two types for it and refuses every call (42P08).
        const { rows } = await tx.query(
          `insert into stab_timepoints (study_id,cond_id,label,month,planned_date)
           select $1,$2,$3,$4::int, s.start_date + make_interval(months => $4::int)
             from stab_studies s
            where s.study_id = $1
              and not exists (select 1 from stab_timepoints where study_id = $1 and cond_id = $2 and upper(label) = upper($3))
           returning *`,
          [id, cid, t.label, t.month]
        );
        written.timepoints.push(...rows);
      }

      for (const tst of p.tests || []) {
        const { rows } = await tx.query(
          `insert into stab_tests (study_id,name,unit,spec_low,spec_high,is_cqa)
           select $1,$2,$3,$4,$5,$6
            where not exists (select 1 from stab_tests where study_id = $1 and lower(name) = lower($2))
           returning *`,
          [id, tst.name, tst.unit || null, tst.spec_low ?? null, tst.spec_high ?? null, tst.is_cqa !== false]
        );
        written.tests.push(...rows);
      }

      // What was written, not the template: rows the study already had are not
      // written again, and the template can change after this.
      await audit(id, 'protocol_apply', { proto_id: pid, written }, req, tx);
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'applying protocol');
  }
});

// POST /studies/:id/protocol/draft (AI markdown)
router.post('/studies/:id/protocol/draft', async (req, res) => {
  try {
    const ctx = await withTenantClient(tx => studyContext(tx, req.params.id));
    const draft = await aiDraftProtocol(ctx);
    res.json({ draft });
  } catch (error) {
    return aiFail(res, error, 'drafting the protocol');
  }
});

// POST /studies/:id/capa/ai-suggest  { oot_data }
router.post('/studies/:id/capa/ai-suggest', async (req, res) => {
  try {
    const ctx = await withTenantClient(tx => studyContext(tx, req.params.id));
    const suggestion = await aiCAPAFromOOT(ctx, req.body?.oot ?? req.body ?? null);
    res.json(suggestion);
  } catch (error) {
    return aiFail(res, error, 'suggesting a CAPA');
  }
});

// GET /api/stability/methods?q=assay  -> minimal list from cmc_methods
router.get('/methods', async (req, res) => {
  try {
    const qstr = ((req.query.q as string) || '').toLowerCase();
    const { rows } = await pool.query<any>(
      `
      select id as method_id, title as name, status
      from cmc_methods
      where ($1='' or lower(title) like '%'||$1||'%')
      order by status desc, title asc`,
      [qstr]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching methods:', error);
    res.status(500).json({ error: 'Failed to fetch methods' });
  }
});

// GET /api/stability/studies/:id/tests/with-methods
router.get('/studies/:id/tests/with-methods', async (req, res) => {
  try {
    const id = req.params.id;
    const { rows } = await pool.query<any>(
      `
      select t.*, m.title as method_name, m.status as method_status
      from stab_tests t
      left join cmc_methods m on m.id=t.method_id
      where t.study_id=$1
      order by t.name`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching tests with methods:', error);
    res.status(500).json({ error: 'Failed to fetch tests with methods' });
  }
});

// PATCH /api/stability/tests/:id (link method) — REMOVED 2026-09-23. It could
// never run: PATCH /tests/:testId above matches the same path first. That route
// now updates only the fields sent, so linking a method there no longer clears
// the specification limits.

// Assignments API
// GET assignments for a study
router.get('/studies/:id/assignments', async (req, res) => {
  try {
    const { rows } = await pool.query<any>(
      `
      select a.assign_id, a.user_id, a.role, a.status, a.due_date, a.created_at
      from stab_assignments a
      where a.study_id=$1
      order by a.created_at desc`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// POST assign a user  body:{ user_id, role, due_date? }
router.post('/studies/:id/assign', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    if (!b.user_id || !b.role) return res.status(400).json({ error: 'user_id, role required' });
    const row = await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const { rows } = await tx.query(
        `insert into stab_assignments (study_id,user_id,role,due_date)
         values ($1,$2,$3,$4) returning *`,
        [id, b.user_id, b.role, b.due_date || null]
      );
      await audit(id, 'assign_add', { assignment: rows[0] }, req, tx);
      return rows[0];
    });
    res.json(row);
  } catch (error) {
    return fail(res, error, 'creating assignment');
  }
});

// POST bulk assign multiple tasks  body:{ assignments: [{ task, user, role, due }] }
router.post('/studies/:id/bulk-assign', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    if (!b.assignments || !Array.isArray(b.assignments)) {
      return res.status(400).json({ error: 'assignments array required' });
    }

    const results = await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const added = [];
      for (const assignment of b.assignments) {
        if (!assignment.user || !assignment.task) continue;
        const { rows } = await tx.query(
          `insert into stab_assignments (study_id,user_id,role,due_date)
           values ($1,$2,$3,$4) returning *`,
          [id, assignment.user, assignment.role || 'Reviewer', assignment.due || null]
        );
        added.push(rows[0]);
      }
      // What was stored, and how many entries were not (no user or task) — the
      // record listed every entry sent, including the skipped ones.
      await audit(
        id,
        'bulk_assign',
        { count: added.length, skipped: b.assignments.length - added.length, assignments: added },
        req,
        tx
      );
      return added;
    });
    res.json({ assigned: results.length, items: results });
  } catch (error) {
    return fail(res, error, 'creating bulk assignment');
  }
});

// PATCH assignment status  body:{ status }
router.patch('/assignments/:assignId', async (req, res) => {
  try {
    const a = req.params.assignId;
    const b = req.body || {};
    await withTenantClient(async tx => {
      const before = await ownChild(tx, 'stab_assignments', a, 'assignment');
      const { rows } = await tx.query(
        `update stab_assignments set status=coalesce($2,status), due_date=coalesce($3::date,due_date)
          where assign_id=$1 returning *`,
        [a, b.status || null, b.due_date || null]
      );
      await audit(before.study_id, 'assign_update', { assign_id: a, before, after: rows[0] }, req, tx);
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'updating assignment');
  }
});

// POST request signoff — REMOVED 2026-09-10 (WO-16B finding 30).
//
// This route demanded a password it never verified, derived the signer's §11.50
// printed name from the email's local-part, and stored `${stage}-${Date.now()}`
// as the signature "hash". Every row it wrote was an invented signature. It had
// no caller in client/ and is outside the orphan scanner's reach
// (server/src/routes is not walked), so nothing consumed it. A governed study
// sign-off has to be built on the one Part 11 signing path
// (server/services/part11/signature-persistence.ts) before it can exist; until
// then the route says so rather than recording a stand-in. Reads of
// stab_signoffs (the dependencies view) are untouched and honestly empty.
router.post('/studies/:id/request-signoff', (_req, res) => {
  res.status(410).json({
    error: 'STABILITY_SIGNOFF_REMOVED',
    message:
      'Study sign-off through this route is retired: it recorded a signature without verifying the signer. ' +
      'No sign-off was recorded. A Part 11 sign-off for stability studies is not yet available.',
  });
});

// GET /api/stability/studies/:id/dependencies - data flow lineage
router.get('/studies/:id/dependencies', async (req, res) => {
  try {
    const id = req.params.id;
    const [{ rows: s }, { rows: tests }, { rows: sign }, { rows: exports }] = await Promise.all([
      pool.query<any>(
        `select study_id, code, name, climatic_zone, duration_months, label_storage from stab_studies where study_id=$1`,
        [id]
      ),
      pool.query<any>(
        `select t.test_id, t.name, t.method_id, m.title as method_name, m.status as method_status
              from stab_tests t left join cmc_methods m on m.id=t.method_id where t.study_id=$1`,
        [id]
      ),
      pool.query<any>(
        `select stage, signer_name, signed_at, hash from stab_signoffs where study_id=$1 order by signed_at desc`,
        [id]
      ),
      pool.query<any>(
        `select export_id, fmt, created_at from stab_exports where study_id=$1 order by created_at desc`,
        [id]
      ),
    ]);
    const missingMethods = tests
      .filter(
        (t: any) =>
          !t.method_id || !['VALIDATED', 'APPROVED'].includes((t.method_status || '').toUpperCase())
      )
      .map((t: any) => t.name);
    res.json({
      study: s[0] || null,
      tests: tests,
      authoring: { exports },
      signoffs: sign,
      analytical: { missingMethods, ok: missingMethods.length === 0 },
    });
  } catch (error) {
    console.error('Error fetching dependencies:', error);
    res.status(500).json({ error: 'Failed to fetch dependencies' });
  }
});

/** GET upcoming timepoints (unsampled) */
router.get('/studies/:id/timepoints/upcoming', async (req, res) => {
  const id = req.params.id;
  const count = Number(req.query.count || 3);
  const { rows } = await pool.query<any>(
    `select * from v_stab_upcoming_tp where study_id=$1 limit $2`,
    [id, count]
  );
  res.json(rows);
});

/** POST bulk-assign next N timepoints  body: { user_id, count=3, role='Sampler' } */
router.post('/studies/:id/timepoints/bulk-assign', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  if (!b.user_id) return res.status(400).json({ error: 'user_id required' });
  const count = Number(b.count || 3);
  try {
    const ins = await withTenantClient(async tx => {
      await ownStudy(tx, id);
      const tps = (
        await tx.query(`select * from v_stab_upcoming_tp where study_id=$1 limit $2`, [id, count])
      ).rows;
      const added: any[] = [];
      const unplanned: string[] = [];
      for (const tp of tps) {
        // A timepoint with no planned date gets no invented one (it was
        // today + month); it is reported for someone to plan.
        if (!tp.planned_date) {
          unplanned.push(tp.label);
          continue;
        }
        const due = tp.planned_date;
        const { rows } = await tx.query(
          `insert into stab_assignments (study_id,tp_id,user_id,role,due_date) values ($1,$2,$3,$4,$5) returning *`,
          [id, tp.tp_id, b.user_id, b.role || 'Sampler', due]
        );
        added.push(rows[0]);
      }
      await audit(id, 'bulk_assign', { count: added.length, user_id: b.user_id, assignments: added, unplanned }, req, tx);
      return { added, unplanned };
    });
    res.json({ assigned: ins.added.length, items: ins.added, unplanned: ins.unplanned });
  } catch (error) {
    return fail(res, error, 'assigning timepoints');
  }
});

/** POST push upcoming timepoints to Google Calendar  body: { count=10, timezone? } */
router.post('/studies/:id/timepoints/push-calendar', async (req, res) => {
  const id = req.params.id;
  const count = Number(req.body?.count || 10);
  const tz = req.body?.timezone || 'America/Los_Angeles';
  if (!calendarEnabled()) {
    // Nothing was pushed, so this is not a success.
    return res.status(503).json({ error: 'Calendar integration is not configured; use the ICS schedule instead' });
  }
  /* 2026-10-01 (D6, decision P-8): the calendar is the deployment's own
     account, and it is written only for the organisation it belongs to
     (services/integrations/platform-integration-owner.ts). Any organisation's
     stability study pushed its sampling dates onto it. */
  if (!callerOwnsPlatformIntegrations()) {
    return res.status(503).json({
      error: `${notYourIntegrationNote('team calendar')} Use the ICS schedule instead.`,
      code: 'CALENDAR_NOT_YOURS',
    });
  }
  try {
    const tps = await withTenantClient(async tx => {
      await ownStudy(tx, id);
      return (await tx.query(`select * from v_stab_upcoming_tp where study_id=$1 limit $2`, [id, count])).rows;
    });
    // The events are outside the database and cannot share its transaction.
    // Whatever was created is recorded, including when a later event fails:
    // it failed with nothing recorded, leaving events behind a 500.
    const ids: any[] = [];
    let failure: unknown = null;
    const unplanned: string[] = [];
    for (const tp of tps) {
      if (!tp.planned_date) {
        // No planned date: no event (it was put on today's date).
        unplanned.push(tp.label);
        continue;
      }
      try {
        const date = format(new Date(tp.planned_date), 'yyyy-MM-dd');
        const ev = await insertAllDayEvent({
          summary: `Stability sampling ${tp.kind} ${tp.label}`,
          description: `Study ${id} — ${tp.kind} ${tp.label}`,
          date,
          timezone: tz,
        });
        ids.push(ev?.id);
      } catch (error) {
        failure = error;
        break;
      }
    }
    if (ids.length) {
      await withTenantClient(tx =>
        audit(id, 'calendar_push', { created: ids.length, ids, unplanned, incomplete: failure !== null }, req, tx)
      );
    }
    if (failure) {
      return res.status(502).json({
        error: 'The calendar refused an event; the ones created before it are recorded',
        created: ids.length,
        ids,
      });
    }
    return res.json({ ok: true, created: ids.length, ids, unplanned });
  } catch (error) {
    return fail(res, error, 'pushing calendar');
  }
});

// ========== SAMPLING WORKBENCH ==========

// GET due timepoints (date window)
router.get('/studies/:id/timepoints/due', async (req, res) => {
  const id = req.params.id;
  const limit = Number(req.query.limit || 20);
  const { rows } = await pool.query<any>(`select * from v_stab_due_tp where study_id=$1 limit $2`, [
    id,
    limit,
  ]);
  res.json(rows);
});

// POST create sample for a timepoint  body:{ tp_id, storage?, notes? }
router.post('/studies/:id/samples', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  if (!b.tp_id) return res.status(400).json({ error: 'tp_id required' });
  try {
    const sample = await withTenantClient(async tx => {
      // Build sample_code: <code>-<kind>-<label>-<YYYYMMDD>-NN. The study row is
      // locked so two samples for one timepoint cannot take the same sequence.
      const study = await ownStudy(tx, id);
      const tp = found(
        (
          await tx.query(
            `select t.tp_id, t.label, c.kind, coalesce(t.planned_date,current_date) as dt
               from stab_timepoints t join stab_conditions c on c.cond_id=t.cond_id
              where t.tp_id=$1 and t.study_id=$2`,
            [b.tp_id, id]
          )
        ).rows,
        'timepoint'
      );
      const dateStr = new Date(tp.dt).toISOString().slice(0, 10);
      const base = `${study.code}-${tp.kind}-${tp.label}-${dateStr}`;
      const n = (
        await tx.query(
          `select count(*)::int as n from stab_samples where study_id=$1 and sample_code ilike $2||'%'`,
          [id, base]
        )
      ).rows[0].n;
      const sample_code = `${base}-${String(n + 1).padStart(2, '0')}`;
      const { rows } = await tx.query(
        `insert into stab_samples (study_id,tp_id,sample_code,storage,notes)
         values ($1,$2,$3,$4,$5) returning *`,
        [id, b.tp_id, sample_code, b.storage || null, b.notes || null]
      );
      await audit(id, 'sample_create', rows[0], req, tx);
      return rows[0];
    });
    res.json(sample);
  } catch (error) {
    return fail(res, error, 'creating sample');
  }
});

// POST mark collected  body:{ sample_id, collected_at? }
//
// collected_by is the verified principal, never the body: it read
// `b.collected_by || requireActor(req)`, so any caller could record someone else
// as the collector, in the sample and in its audit record (ledger C-18). A body
// naming a different collector is refused rather than silently overridden.
router.post('/studies/:id/samples/collect', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  if (!b.sample_id) return res.status(400).json({ error: 'sample_id required' });
  if (b.collected_by !== undefined && b.collected_by !== null && b.collected_by !== '' && b.collected_by !== requireActor(req)) {
    return res
      .status(400)
      .json({ error: 'collected_by is the signed-in user; a sample cannot be recorded as collected by someone else' });
  }
  try {
    await withTenantClient(async tx => {
      await ownStudy(tx, id);
      // Scoped to the study in the path: any sample of the tenant could be
      // marked collected here and audited under this study.
      const { rows } = await tx.query(
        `update stab_samples set collected_at=coalesce($2::timestamptz, now()), collected_by=coalesce($3,collected_by)
          where sample_id=$1 and study_id=$4 returning collected_at, collected_by`,
        [b.sample_id, b.collected_at || null, requireActor(req), id]
      );
      const done = found(rows, 'sample');
      await audit(id, 'sample_collect', { sample_id: b.sample_id, ...done }, req, tx);
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'collecting sample');
  }
});

// GET samples for a study
router.get('/studies/:id/samples', async (req, res) => {
  const { rows } = await pool.query<any>(
    `select * from stab_samples where study_id=$1 order by created_at desc`,
    [req.params.id]
  );
  res.json(rows);
});

// GET barcode (Code128 PNG)
router.get('/samples/:sampleId/barcode.png', async (req, res) => {
  const sid = req.params.sampleId;
  const { rows } = await pool.query<any>(
    `select sample_code from stab_samples where sample_id=$1`,
    [sid]
  );
  if (!rows[0]) return res.status(404).send('not found');
  try {
    const png = await barcodePng({
      bcid: 'code128',
      text: rows[0].sample_code,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
    });
    res.setHeader('Content-Type', 'image/png');
    res.end(png);
  } catch (e: any) {
    console.error('barcode err', e.message || e);
    res.status(500).send('barcode error');
  }
});

// ===== Results ↔ Sample Link =====

// POST /api/stability/studies/:id/results/link-sample  body: { result_id, sample_id }
// POST /api/stability/studies/:id/results/link-by-code  body: { result_id, sample_code }
// Both write stab_results.sample_id — see resultReviewUnavailable.
router.post('/studies/:id/results/link-sample', resultReviewUnavailable);
router.post('/studies/:id/results/link-by-code', resultReviewUnavailable);

// ===== Chain of Custody =====

// GET /api/stability/samples/:sampleId/chain
router.get('/samples/:sampleId/chain', async (req, res) => {
  const { rows } = await pool.query<any>(
    `select * from stab_chain where sample_id=$1 order by ts desc`,
    [req.params.sampleId]
  );
  res.json(rows);
});

// POST /api/stability/samples/:sampleId/chain  body:{ action, notes? }
router.post('/samples/:sampleId/chain', async (req, res) => {
  const sid = req.params.sampleId;
  const b = req.body || {};
  const action = (b.action || 'OTHER').toUpperCase();
  if (
    ![
      'CREATED',
      'COLLECTED',
      'RECEIVED',
      'OPENED',
      'SEALED',
      'TRANSFERRED',
      'DISPOSED',
      'OTHER',
    ].includes(action)
  )
    return res.status(400).json({ error: 'invalid action' });
  try {
    await withTenantClient(async tx => {
      // An unknown sample was recorded in the chain anyway and left unaudited.
      const sample = await ownChild(tx, 'stab_samples', sid, 'sample');
      await tx.query(`insert into stab_chain (sample_id,action,actor,notes) values ($1,$2,$3,$4)`, [
        sid,
        action,
        requireActor(req),
        b.notes || null,
      ]);
      await audit(sample.study_id, 'coc_add', { sample_id: sid, action }, req, tx);
    });
    res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'recording chain of custody');
  }
});

// POST /api/stability/samples/:sampleId/chain/upload
//
// Refused, 2026-09-28. It wrote the file to /mnt/data/uploads — container disk,
// gone at the next replacement — and recorded in stab_chain a /uploads/… URL
// that no route serves, so the chain-of-custody ledger pointed at bytes nobody
// could ever retrieve. No client calls it. Attachments belong in Vault, the one
// admission for regulated files (services/vault/vault-ingest.service.ts); a
// stability sample cannot reach it yet, because a Vault document needs a
// regulatory program and stab_samples has no link to one — CMC schema work,
// outside the launch catalog (CLAUDE.md RULE 2). Until that link exists the
// file is filed in Vault and the chain entry cites it in its notes
// (POST /samples/:sampleId/chain above). The multipart body is not read.
router.post('/samples/:sampleId/chain/upload', (_req, res) => {
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message:
      'Chain-of-custody attachments are not stored here. Nothing was stored. File the document in Vault ' +
      'and cite it in the chain entry\'s notes.',
  });
});

export default router;
