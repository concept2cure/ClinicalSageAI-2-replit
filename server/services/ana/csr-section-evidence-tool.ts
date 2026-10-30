/**
 * get_csr_section_evidence — AnA reads the retained CSR evidence pack for one
 * ICH E3 section of a retained Submission Center run, and reconciles the
 * figures she drafted back to its cells (CSR end to end, slice 1,
 * docs/design/CSR_END_TO_END_2026-10-29.md).
 *
 * ── What it reaches ──────────────────────────────────────────────────────────
 * Nothing here is new evidence logic. It is the chat's way to the pack that
 * already exists and that only the caller-less POST
 * /api/ana-cortex/csr/evidence-context reached:
 *   - loadCsrAuthoringEvidence (services/csr/cortex-authoring-reader.ts):
 *     the canonical readSavedClinicalTables (project ACL, sealed-run receipt,
 *     current source eligibility) and buildCsrAuthoringEvidence (the E3
 *     section → table map, identifier screening, the digest);
 *   - reconcileCsrTableClaims (services/csr/cortex-authoring-context.ts):
 *     exact-cell agreement of a claimed figure with the table it cites.
 *
 * ── Rules it keeps ───────────────────────────────────────────────────────────
 *   - RULE 2: every figure returned is an engine cell (csr-tabulation-
 *     builders over the sealed run). The model narrates; it never supplies one.
 *   - The program comes from the open conversation (admitAnaProjectScope),
 *     never from input; the run, study and section are identifiers only.
 *   - Fail closed: a revoked or superseded source, no access, an unmapped
 *     section, a failed read or a moved digest is a typed refusal
 *     (CSR_SECTION_EVIDENCE_UNAVAILABLE + reason). An empty pack is never
 *     returned as if the section had no data.
 *   - Every result fits RESULT_BUDGET whole: large tables are paged by whole
 *     rows, never cut, and no result has a top-level `status`.
 *
 * @module server/services/ana/csr-section-evidence-tool
 */

import type { AnaTool } from '../ai-gateway/types';
import type { ToolContext } from './AnaToolExecutor.js';
import type { RegisterFn } from './document-tools-shared.js';
import type { RequestSqlClient } from '../../db/requestDb';
import { withTenantConnection } from '../../db/withTenantConnection';
import { admitAnaProjectScope, AnaProjectScopeError } from './project-scope-admission';
import { createScopedLogger } from '../../utils/logger';
import { RESULT_BUDGET } from './result-budget.js';
import { loadCsrAuthoringEvidence } from '../csr/cortex-authoring-reader.js';
import {
  CSR_AUTHORING_EVIDENCE_RULES,
  CsrAuthoringContextError,
  reconcileCsrTableClaims,
  type CsrAuthoringEvidence,
  type RetainedCsrTables,
} from '../csr/cortex-authoring-context.js';
import { CsrSourceInputError } from '../csr/source-access.js';

const logger = createScopedLogger('csr-section-evidence-tool');

export const CSR_SECTION_EVIDENCE_UNAVAILABLE = 'CSR_SECTION_EVIDENCE_UNAVAILABLE';
/** Claims per reconciliation call: the findings must fit the result budget whole. */
export const CSR_CLAIMS_PER_CALL = 40;

export const GET_CSR_SECTION_EVIDENCE: AnaTool = {
  name: 'get_csr_section_evidence',
  description:
    'The engine tables for one ICH E3 section of a clinical study report, read from a retained Submission Center run ' +
    '(its sealed CSR source, re-verified now), bound to an evidence digest, with their limitations. Call it before ' +
    'drafting or reviewing any CSR results section (E3 2 synopsis, 10 study patients, 11 efficacy, 12 safety, 13 discussion and overall conclusions) ' +
    'and write every figure from these cells, citing the table key and digest; never supply a figure yourself. ' +
    'Pass run_id, study_id and section ("12.2"). A large table is listed without rows: pass table=<key> and ' +
    'row_offset to read its rows page by page. To check a draft, pass claims (each figure you wrote as ' +
    '{table, row, column, value}, value exactly as written) with the evidence_digest you drafted from: it reports ' +
    'every figure that does not match its cell. An error means the evidence is unavailable: say so, never "no data".',
  input_schema: {
    type: 'object',
    properties: {
      run_id: { type: 'string', description: 'The retained Submission Center run id (uuid).' },
      study_id: { type: 'string', description: 'The study id as recorded in the run\'s CSR source.' },
      section: { type: 'string', description: 'ICH E3 heading number, e.g. "10.1", "11.4", "12.2".' },
      table: { type: 'string', description: 'A table key from a previous result, to read its rows.' },
      row_offset: { type: 'number', description: 'First row (0-based) of the table page. Default 0.' },
      evidence_digest: { type: 'string', description: 'With claims: the evidence_digest the draft was written from.' },
      claims: {
        type: 'array',
        description: `Figures in the draft to reconcile, at most ${CSR_CLAIMS_PER_CALL} per call.`,
        items: {
          type: 'object',
          properties: {
            table: { type: 'string' }, row: { type: 'number' }, column: { type: 'number' },
            value: { type: 'string', description: 'The figure exactly as the draft states it.' },
          },
          required: ['table', 'row', 'column', 'value'],
        },
      },
    },
    required: ['run_id', 'study_id', 'section'],
  },
};

// ── dependencies (injected by tests) ─────────────────────────────────────────

type Actor = { organizationId: number; userId: number };
export interface CsrSectionEvidenceDeps {
  /** A request executor for isolated callers and tests; live calls use ctx.sqlClient. */
  pool?: () => RequestSqlClient | Promise<RequestSqlClient>;
  /** The open program, from the conversation. Default: admitAnaProjectScope. */
  resolveProgram?: (q: RequestSqlClient, ctx: ToolContext & Actor) => Promise<string | null>;
  /** The retained-table reader. Default: readSavedClinicalTables. */
  load?: (q: RequestSqlClient, scope: Actor & { programId: string }, runId: string) => Promise<RetainedCsrTables>;
}

class Refusal extends Error {
  constructor(readonly reason: string, readonly detail?: Record<string, unknown>) { super(reason); }
}

const UNAVAILABLE_INSTRUCTION =
  'Tell the person the section evidence is unavailable and why. Do not describe the section as having no data, ' +
  'no events or zero counts, and do not supply any figure from memory or estimate.';

function refusal(reason: string, message: string, detail: Record<string, unknown> = {}): string {
  return JSON.stringify({ error: CSR_SECTION_EVIDENCE_UNAVAILABLE, reason, message, ...detail, instruction: UNAVAILABLE_INSTRUCTION });
}

const MESSAGES: Record<string, string> = {
  ANA_PROJECT_REQUIRED: 'No project is open. Open the project that holds the run.',
  CSR_EVIDENCE_ACTOR_REQUIRED: 'An identified organization member is required to read retained CSR evidence.',
  CSR_SECTION_NO_RETAINED_TABLES: 'No retained engine table supports this section in this run.',
  CSR_EVIDENCE_DIGEST_REQUIRED: 'Pass the evidence_digest the draft was written from to reconcile its figures.',
  CSR_EVIDENCE_DIGEST_CHANGED: 'The section evidence no longer matches the digest the draft was written from. Read it again and redraft.',
  CSR_EVIDENCE_READ_FAILED: 'The retained run could not be read just now.',
};

/** A known refusal from the reader, the selection parser or scope admission; anything else is a failed read. */
function refusalOf(err: unknown): string {
  if (err instanceof Refusal) return refusal(err.reason, MESSAGES[err.reason] ?? err.reason, err.detail);
  if (err instanceof CsrAuthoringContextError) return refusal(err.code, MESSAGES[err.code] ?? 'The selection or its source did not verify.');
  if (err instanceof CsrSourceInputError || err instanceof AnaProjectScopeError) return refusal(err.code, err.message);
  // The driver's message names tables; it goes to the log, never to the model.
  logger.error('get_csr_section_evidence failed', { err: err instanceof Error ? err.message : String(err) });
  return refusal('CSR_EVIDENCE_READ_FAILED', MESSAGES.CSR_EVIDENCE_READ_FAILED);
}

// ── reading the pack ─────────────────────────────────────────────────────────

const defaultResolveProgram: NonNullable<CsrSectionEvidenceDeps['resolveProgram']> = async (q, ctx) =>
  (await admitAnaProjectScope(q, { organizationId: ctx.organizationId, userId: ctx.userId,
    projectId: ctx.projectId ?? null, projectRef: ctx.projectRef ?? null })).programId;

async function readEvidence(q: RequestSqlClient, input: Record<string, unknown>, ctx: ToolContext & Actor,
  deps: CsrSectionEvidenceDeps): Promise<CsrAuthoringEvidence> {
  const programId = await (deps.resolveProgram ?? defaultResolveProgram)(q, ctx);
  if (!programId) throw new Refusal('ANA_PROJECT_REQUIRED');
  const selection = { programId, runId: input.run_id, studyId: input.study_id, sectionNumber: input.section };
  const evidence = await loadCsrAuthoringEvidence(q, { organizationId: ctx.organizationId, userId: ctx.userId },
    selection, deps.load);
  if (evidence.status === 'unavailable') {
    throw new Refusal('CSR_SECTION_NO_RETAINED_TABLES', {
      missing_tables: evidence.missingTables, omitted_tables: evidence.omittedTables, limitations: evidence.limitations,
    });
  }
  return evidence;
}

function actorOf(ctx: ToolContext | undefined): (ToolContext & Actor) | null {
  const org = Number(ctx?.organizationId); const user = Number(ctx?.userId);
  if (!ctx || !Number.isSafeInteger(org) || org <= 0 || !Number.isSafeInteger(user) || user <= 0) return null;
  return { ...ctx, organizationId: org, userId: user };
}

async function withClient<T>(ctx: ToolContext & Actor, deps: CsrSectionEvidenceDeps,
  fn: (q: RequestSqlClient) => Promise<T>): Promise<T> {
  if (ctx.sqlClient) return fn(ctx.sqlClient);
  if (deps.pool) return fn(await deps.pool());
  return withTenantConnection({ tenantId: ctx.organizationId, orgUuid: ctx.organizationUuid ?? undefined,
    source: 'job', caller: 'ana-csr-section-evidence' }, (client) => fn(client as unknown as RequestSqlClient));
}

// ── shaping the result ───────────────────────────────────────────────────────

function header(e: CsrAuthoringEvidence) {
  return {
    run_id: e.runId, study_id: e.studyId, section: e.sectionNumber, source: e.source,
    evidence_digest: e.evidenceDigest, evidence_status: e.status,
    release_eligibility_verified: e.releaseEligibilityVerified, clinical_verification: e.clinicalVerification,
    approval_required: e.approvalRequired,
  };
}

/** The pack, as whole as fits: rows inline, else headers without rows, else keys only. Never a cut table. */
function overview(e: CsrAuthoringEvidence): string {
  const base = { evidence: header(e), missing_tables: e.missingTables, omitted_tables: e.omittedTables,
    limitations: e.limitations, rules: CSR_AUTHORING_EVIDENCE_RULES };
  const shapes = [
    (t: CsrAuthoringEvidence['tables'][number]) => ({ key: t.key, title: t.title, sha256: t.sha256, headers: t.headers, row_count: t.rows.length, rows: t.rows }),
    (t: CsrAuthoringEvidence['tables'][number]) => ({ key: t.key, title: t.title, sha256: t.sha256, headers: t.headers, row_count: t.rows.length }),
    (t: CsrAuthoringEvidence['tables'][number]) => ({ key: t.key, sha256: t.sha256, row_count: t.rows.length }),
  ];
  for (const [i, shape] of shapes.entries()) {
    const out = JSON.stringify({ ...base, tables: e.tables.map(shape),
      ...(i > 0 ? { rows_not_shown: 'Rows were not included to fit this response. Pass table=<key> and row_offset to read them; row numbers are absolute.' } : {}) });
    if (out.length <= RESULT_BUDGET) return out;
  }
  return refusal('CSR_EVIDENCE_RESPONSE_TOO_LARGE', 'The section evidence could not be listed whole in one response.',
    { evidence_digest: e.evidenceDigest, tables: e.tables.map((t) => t.key) });
}

/** One page of one table: as many WHOLE rows from row_offset as fit. */
function tablePage(e: CsrAuthoringEvidence, key: unknown, rawOffset: unknown): string {
  const t = e.tables.find((x) => x.key === key);
  if (!t) return refusal('CSR_EVIDENCE_TABLE_NOT_IN_SECTION', 'That table is not in this section\'s evidence.', { tables: e.tables.map((x) => x.key) });
  const offset = rawOffset === undefined ? 0 : Number(rawOffset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= t.rows.length) {
    return refusal('CSR_EVIDENCE_ROW_OFFSET_INVALID', `row_offset must be 0 to ${t.rows.length - 1}.`);
  }
  const render = (end: number) => JSON.stringify({ evidence_digest: e.evidenceDigest,
    table: { key: t.key, title: t.title, sha256: t.sha256, headers: t.headers, total_rows: t.rows.length, row_offset: offset, rows: t.rows.slice(offset, end) },
    next_row_offset: end < t.rows.length ? end : null });
  let lo = offset + 1; let hi = t.rows.length;
  if (render(lo).length > RESULT_BUDGET) return refusal('CSR_EVIDENCE_ROW_TOO_LARGE', 'One row of this table does not fit a response whole.');
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (render(mid).length <= RESULT_BUDGET) lo = mid; else hi = mid - 1; }
  return render(lo);
}

/** Exact-cell reconciliation against the evidence the draft was written from, and only that. */
function reconcile(e: CsrAuthoringEvidence, digest: unknown, claims: unknown): string {
  if (typeof digest !== 'string' || !digest) throw new Refusal('CSR_EVIDENCE_DIGEST_REQUIRED');
  if (digest !== e.evidenceDigest) throw new Refusal('CSR_EVIDENCE_DIGEST_CHANGED', { evidence_digest: e.evidenceDigest });
  if (Array.isArray(claims) && claims.length > CSR_CLAIMS_PER_CALL) {
    return JSON.stringify({ error: 'CSR_CLAIMS_TOO_MANY', message: `Reconcile at most ${CSR_CLAIMS_PER_CALL} figures per call.` });
  }
  let result: ReturnType<typeof reconcileCsrTableClaims>;
  try { result = reconcileCsrTableClaims(e, claims); } catch (err) {
    if (err instanceof CsrAuthoringContextError) {
      return JSON.stringify({ error: err.code, message: 'Each claim is {table, row, column, value} with integer row/column and value as text.' });
    }
    throw err;
  }
  const counts = { matches: 0, mismatch: 0, unsupported: 0 };
  for (const f of result.findings) counts[f.status as keyof typeof counts] += 1;
  const out = JSON.stringify({ evidence_digest: result.evidenceDigest, basis: result.basis, reconciliation: result.status,
    clinical_verification: result.clinicalVerification, counts,
    not_reconciled: result.findings.filter((f) => f.status !== 'matches')
      .map((f) => ({ index: f.index, result: f.status, table: f.table, row: f.row, column: f.column, expected: f.expected })),
    note: 'Agreement with a cell is transcription agreement only, not clinical or statistical verification. Correct every figure listed before release.' });
  return out.length <= RESULT_BUDGET ? out
    : JSON.stringify({ error: 'CSR_CLAIMS_RESULT_TOO_LARGE', message: 'The findings do not fit one response whole. Reconcile fewer figures per call.' });
}

/** The handler: actor and project first, then the pack, then the mode the input asks for. */
export async function csrSectionEvidence(input: Record<string, unknown>, ctx: ToolContext | undefined,
  deps: CsrSectionEvidenceDeps = {}): Promise<string> {
  const actor = actorOf(ctx);
  if (!actor) return refusalOf(new Refusal('CSR_EVIDENCE_ACTOR_REQUIRED'));
  if (actor.projectId == null && !actor.projectRef) return refusalOf(new Refusal('ANA_PROJECT_REQUIRED'));
  try {
    return await withClient(actor, deps, async (q) => {
      const evidence = await readEvidence(q, input, actor, deps);
      if (input.claims !== undefined) return reconcile(evidence, input.evidence_digest, input.claims);
      if (input.table !== undefined) return tablePage(evidence, input.table, input.row_offset);
      return overview(evidence);
    });
  } catch (err) {
    return refusalOf(err);
  }
}

/** Register the handler on the executor's registry (or a test's). */
export function registerCsrSectionEvidenceHandlers(register: RegisterFn, deps: CsrSectionEvidenceDeps = {}): void {
  register('get_csr_section_evidence', async (input, ctx) => csrSectionEvidence(input ?? {}, ctx, deps));
}
