/**
 * The world the founder-path lineage walk runs in, and the one rule every hop
 * is judged by. Support for tests/lineage/founder-path-lineage.pglite.test.ts —
 * not a test file; read that file's header first.
 *
 *   • Hop / the baseline — a hop's checks, judged against the shrink-only
 *     tests/lineage/founder-path-lineage.baseline.json.
 *   • buildWorld — one PGlite database built from the migration list the test
 *     file declares (so the migration-list closure contract sees it), seeded
 *     with org A, its author and its approver, and one express app mounting the
 *     real routers the founder's path goes through.
 */
import express from 'express';
import request from 'supertest';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJourneyDb, extractTableDdl, makeRequestDbClient, type JourneyDb } from '../golden-journeys/harness';
import { SUBMISSION_CORE_PGLITE_DDL, LEAF_SOURCE_PGLITE_DDL } from '../../server/db/pglite-harness';
import { VAULT_DDL, mint, asToken } from '../../server/routes/__tests__/_authoring-canvas-fixture';
import { APPROVED_SERVING_MODEL } from '../../server/services/ana/__tests__/support/approved-tool-handler';

// ─────────────────────────────────────────────────────────────────────────────
// The baseline
// ─────────────────────────────────────────────────────────────────────────────

export interface BaselineEntry {
  /** Verified finding ids (docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md), or LX00-Fn for one this test found. */
  findings: string[];
  /** The LX fix(es) that close it, in order. Empty only for an LX00-Fn finding the plan does not cover. */
  closedBy: string[];
  /** What the check observes at HEAD, as `show` serializes it. */
  observed: string;
  why: string;
}
interface Baseline {
  /** The baseline only shrinks: this is its size when it was written. */
  ceiling: number;
  hops: Record<string, Record<string, BaselineEntry>>;
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE: Baseline = JSON.parse(fs.readFileSync(path.join(HERE, 'founder-path-lineage.baseline.json'), 'utf8'));

/** hop → the checks it ran, so a stale baseline entry is caught. */
export const ran = new Map<string, Set<string>>();
export const show = (v: unknown): string => (v === undefined ? 'undefined' : JSON.stringify(v));

interface CheckResult { id: string; claim: string; ok: boolean; observed: string; error?: { name?: string; message?: string } }

const fixes = (b: BaselineEntry) => b.closedBy.join(' then ') || 'no LX fix';

/** One result against its baseline entry: a line for the log, or the problem that fails the run. */
function judge(hopId: string, r: CheckResult, b: BaselineEntry | undefined): { line?: string; problem?: string } {
  const where = `${hopId}/${r.id}`;
  if (r.ok) {
    return b
      ? { problem: `${where} now PASSES and the baseline still lists it (${b.findings.join(', ')} → ${fixes(b)}). Remove the entry from tests/lineage/founder-path-lineage.baseline.json: the baseline only shrinks.` }
      : { line: `  green  ${r.id} — ${r.claim}` };
  }
  if (!b) return { problem: `${where} FAILS and is not baselined — ${r.claim}\n    observed ${r.observed}\n    ${r.error?.name}: ${r.error?.message}` };
  if (r.error?.name !== 'AssertionError') {
    return { problem: `${where} is baselined, but it did not fail its assertion — it threw ${r.error?.name}: ${r.error?.message}. A baseline entry excuses a recorded gap, never a walk that could not run.` };
  }
  if (r.observed !== b.observed) {
    return { problem: `${where} still fails, but on a different value: observed ${r.observed}, the baseline records ${b.observed}. Re-examine the hop and update the entry deliberately.` };
  }
  return { line: `  RED    ${r.id} — baselined ${b.findings.join(', ')} → ${fixes(b)}; observed ${r.observed}` };
}

/**
 * One hop of the path. Each `check` is one recorded-lineage claim; `verdict`
 * fails the hop when a check the baseline does not list fails, when a
 * baselined check passes or fails on another value or without an assertion,
 * or when the baseline lists a check the hop did not run.
 */
export class Hop {
  private readonly results: CheckResult[] = [];

  constructor(readonly id: string) {
    ran.set(id, new Set());
  }

  /** `observe` records the value the claim is about, before it is asserted. */
  async check(id: string, claim: string, fn: (observe: (v: unknown) => void) => unknown): Promise<void> {
    ran.get(this.id)!.add(id);
    let observed = 'not observed';
    const observe = (v: unknown) => { observed = show(v); };
    try {
      await fn(observe);
      this.results.push({ id, claim, ok: true, observed });
    } catch (error) {
      this.results.push({ id, claim, ok: false, observed, error: error as CheckResult['error'] });
    }
  }

  verdict(): void {
    const entries = BASELINE.hops[this.id] ?? {};
    const judged = this.results.map((r) => judge(this.id, r, entries[r.id]));
    const problems = judged.flatMap((j) => (j.problem ? [j.problem] : []));
    for (const id of Object.keys(entries)) {
      if (!this.results.some((r) => r.id === id)) problems.push(`baseline entry ${this.id}/${id} names a check this hop did not run`);
    }
    console.info(`[founder-path] ${this.id}\n${judged.flatMap((j) => (j.line ? [j.line] : [])).join('\n')}`);
    if (problems.length) throw new Error(problems.join('\n'));
  }
}

/** What is wrong with one baseline entry, if anything. */
function entryProblems(where: string, e: BaselineEntry, didRun: boolean): string[] {
  const problems: string[] = [];
  if (!didRun) problems.push(`${where}: no such check ran`);
  const findings = Array.isArray(e.findings) ? e.findings : [];
  const closedBy = Array.isArray(e.closedBy) ? e.closedBy : [];
  if (findings.length === 0) problems.push(`${where}: names no finding`);
  for (const f of findings) if (!/^(AC|DR-ANA|SUB)-\d+$|^LX00-F\d+$/.test(f)) problems.push(`${where}: '${f}' is not a finding id`);
  for (const fix of closedBy) if (!/^LX-\d{2}$/.test(fix)) problems.push(`${where}: '${fix}' is not an LX id`);
  if (closedBy.length === 0 && !findings.some((f) => f.startsWith('LX00-F'))) problems.push(`${where}: names no LX fix`);
  if (typeof e.observed !== 'string' || !e.why) problems.push(`${where}: needs the observed value and why`);
  return problems;
}

/** Every problem with the baseline as a whole: stale or malformed entries, and growth past its ceiling. */
export function baselineProblems(): string[] {
  const entries = Object.entries(BASELINE.hops).flatMap(([hopId, checks]) =>
    Object.entries(checks).map(([checkId, e]) => ({ where: `${hopId}/${checkId}`, e, didRun: Boolean(ran.get(hopId)?.has(checkId)) })));
  const problems = entries.flatMap(({ where, e, didRun }) => entryProblems(where, e, didRun));
  if (entries.length > BASELINE.ceiling) problems.push(`the baseline holds ${entries.length} entries; its ceiling is ${BASELINE.ceiling}. It only shrinks.`);
  return problems;
}

// ─────────────────────────────────────────────────────────────────────────────
// The actors and bytes X
// ─────────────────────────────────────────────────────────────────────────────

export const T = 240_000;
export const ORG_A = 1;
export const ORG_B = 2;
export const PASSWORD = randomBytes(12).toString('hex');
/** users.id is a serial in production; the JWT carries it as a string. */
export const AUTHOR = { id: '3', organizationId: ORG_A, email: 'author@founder.example', name: 'Avery Author' };
export const APPROVER = { id: '4', organizationId: ORG_A, email: 'approver@founder.example', name: 'Quinn Approver' };
/** What the gateway reports as the serving model — the stream passes it as ctx.servingModel (stream.ts:1733). */
export const SERVED_MODEL = APPROVED_SERVING_MODEL;

/** The sentence of X that the AnA draft quotes verbatim. */
export const QUOTE = 'Oral bioavailability of C2C-101 was 62% across the two tested formulations.';
/** Bytes X: what the founder drops into the project's Data Room. */
export const X = Buffer.from(
  [
    'C2C-101-003 Clinical Study Report - synopsis excerpt.',
    QUOTE,
    'Exposure increased dose-proportionally from 10 to 80 mg in healthy volunteers.',
  ].join('\n'),
  'utf8',
);
export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
export const SHA256_X = sha256(X);
export const HEX64 = /^[0-9a-f]{64}$/;

// ─────────────────────────────────────────────────────────────────────────────
// The world
// ─────────────────────────────────────────────────────────────────────────────

/** The vi.hoisted holder the test file's mocks close over. */
export interface Holder {
  db: unknown;
  pool: unknown;
  objects: Map<string, { bytes: Buffer; mime: string; filename: string; orgId: number }>;
  wire: Buffer[];
}

/**
 * Keys handed from one hop to the next — only what the product itself would
 * hold (an id a response returned, or one read from a recorded row). The walks
 * re-derive every key from the database, from one starting id.
 */
export interface Keys {
  programId?: string;
  submissionId?: number;
  filingDocumentId?: string;
  sourceId?: number;
  docId?: string;
  sectionIds?: string[];
  freezeHash?: string;
  approvedSealHash?: string;
  vaultDocumentId?: string;
  coauthorId?: number;
  sequenceId?: number;
  leafIds?: number[];
  transmittalId?: number;
}

export interface World {
  h: Holder;
  jdb: JourneyDb;
  app: express.Express;
  asAuthor: (r: request.Test) => request.Test;
  asApprover: (r: request.Test) => request.Test;
  k: Keys;
  /** Temp directories and environment variables a hop set, undone by close(). */
  tmpDirs: string[];
  envBefore: Record<string, string | undefined>;
  q: <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;
  close: () => Promise<void>;
}

/** The platform /api boundary's verified principal, for the routers that read it from req. */
export const asPrincipal = (orgId: number, userId: number, role = 'admin') => (r: request.Test) =>
  r.set('x-journey-org', String(orgId)).set('x-journey-user', String(userId)).set('x-journey-role', role);

export const json = (v: unknown): Record<string, unknown> =>
  (typeof v === 'string' ? JSON.parse(v) : (v ?? {})) as Record<string, unknown>;

/** Tables taken verbatim from real migration files; everything else is applied from disk by the caller's list. */
function prerequisites(): string {
  const baseline = extractTableDdl('migrations/0000_sweet_joseph.sql', [
    'organizations', 'users', 'organization_users', 'client_workspaces', 'projects',
    'audit_logs', 'electronic_signatures', 'coauthor_documents', 'lumen_data_atoms',
  ]);
  // The package spine's table, only because submission_transmittals references it.
  const packageSpine = extractTableDdl('migrations/0002_phase15_submission_ops.sql', ['c2c_submission_packages']);
  return `${baseline}\n${SUBMISSION_CORE_PGLITE_DDL}\n${LEAF_SOURCE_PGLITE_DDL}\n${VAULT_DDL}\n${packageSpine}`;
}

async function seed(jdb: JourneyDb): Promise<void> {
  const hash = bcrypt.hashSync(PASSWORD, 4);
  await jdb.pool.query(
    `INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES
       ($1, 'founder-org', 'founder-org', 'standard', 10), ($2, 'other-org', 'other-org', 'standard', 10)`,
    [ORG_A, ORG_B],
  );
  await jdb.pool.query(
    `INSERT INTO users (id, email, name, password_hash, title) VALUES
       (3, $1, $2, $5, 'Regulatory Writer'), (4, $3, $4, $5, 'VP Regulatory')`,
    [AUTHOR.email, AUTHOR.name, APPROVER.email, APPROVER.name, hash],
  );
  // The author administers the org (creates the program, files, places); the
  // approver signs (§11.10(g): approver is a signing role; separation of duties
  // keeps the sequence's creator from signing its release).
  await jdb.pool.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, 3, 'admin'), ($1, 4, 'approver')`,
    [ORG_A],
  );
  // One workspace, so the program's PM-spine anchor is unambiguous (program-project-anchor.ts).
  await jdb.pool.query(
    `INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES (1, $1, 'Founder workspace', 'founder-ws')`,
    [ORG_A],
  );
}

/** The real routers the founder's path goes through, behind the principal the platform's /api boundary installs. */
async function mountApp(jdb: JourneyDb): Promise<express.Express> {
  const { default: c2cProjectsRouter } = await import('../../server/routes/c2c/projects');
  const { default: c2cActionsRouter } = await import('../../server/routes/c2c/actions');
  const { default: submissionsRouter } = await import('../../server/routes/submissions');
  const { uploadHandler } = await import('../../server/routes/chat/upload');
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { default: authoringRouter } = await import('../../server/routes/authoring.router');

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    const orgId = Number(req.headers['x-journey-org']);
    const userId = Number(req.headers['x-journey-user']);
    if (Number.isFinite(orgId) && orgId > 0) {
      const role = String(req.headers['x-journey-role'] ?? 'admin');
      const r = req as unknown as Record<string, unknown>;
      r.user = { id: userId, userId, organizationId: orgId, role, roles: [role] };
      r.userId = userId;
      r.userRole = role;
      r.tenantId = orgId;
      r.tenantContext = { organizationId: orgId };
      r.dbClient = makeRequestDbClient(jdb.pglite);
    }
    next();
  });
  app.use('/api/c2c/projects', c2cProjectsRouter);
  app.use('/api/c2c/actions', c2cActionsRouter);
  app.use('/api/submissions', submissionsRouter);
  // server/routes/chat.ts:53-87 — the same memory-storage parser, then the same handler.
  app.post('/api/chat/upload', multer({ storage: multer.memoryStorage() }).single('file'), uploadHandler);
  // The authoring router verifies its own JWT and re-checks membership; the tenant scope is the request's.
  app.use('/api/authoring', (_req, _res, next) =>
    runWithTenantScope({ tenantId: String(ORG_A), role: 'admin', source: 'request', caller: 'founder-path-lineage' }, next),
  );
  app.use('/api/authoring', authoringRouter);
  return app;
}

export async function buildWorld(h: Holder, migrations: readonly string[], testOnlySql: string): Promise<World> {
  const jdb = await createJourneyDb({ prereqSql: prerequisites(), migrations, testOnlySql });
  h.db = jdb.db;
  h.pool = jdb.pool;
  await seed(jdb);
  const app = await mountApp(jdb);
  const world: World = {
    h,
    jdb,
    app,
    asAuthor: asToken(await mint(AUTHOR)),
    asApprover: asToken(await mint(APPROVER)),
    k: {},
    tmpDirs: [],
    envBefore: {},
    q: async <R = Record<string, unknown>>(text: string, params?: unknown[]) => (await jdb.pool.query(text, params)).rows as R[],
    close: async () => {
      for (const [key, value] of Object.entries(world.envBefore)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      for (const d of world.tmpDirs) fs.rmSync(d, { recursive: true, force: true });
      await jdb.close();
    },
  };
  return world;
}
