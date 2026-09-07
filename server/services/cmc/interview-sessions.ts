/**
 * Durable CMC interview sessions.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The guided CMC interview (server/services/ana/intelligence-questions) is a
 * stateless engine: the whole FlowState — every answer given so far — lived
 * only in the AnA tool arguments, round-tripped through the model on every
 * turn. A dropped turn lost the interview, and a completed one had nowhere to
 * land (docs/audits/CMC_CAPTURE_ANALYSIS_M3_EVALUATION_2026-08-31.md, item 5).
 *
 * This is the store: one row per session in `cmc_interview_sessions`
 * (db/migrations/20260906_cmc_interview_sessions.sql), written after every
 * step and read back by id, so the tool surface asks the model for a session
 * id instead of the state.
 *
 * ── Tenancy ──────────────────────────────────────────────────────────────────
 * Every statement carries `organization_id = $n` in its WHERE clause, and the
 * organization comes from the caller's ToolContext, never from model input. A
 * session id the model produced must still belong to the caller's tenant to be
 * readable or writable; a cross-tenant id reads as NOT FOUND, indistinguishable
 * from a missing one. No organization → no query (fail closed before the
 * database, not after).
 *
 * ── Status machine ───────────────────────────────────────────────────────────
 *   active ──save──▶ active ──complete──▶ complete ──commit──▶ committed
 *   active / complete ──abandon──▶ abandoned
 * Each transition is enforced in the UPDATE predicate, so a stale caller
 * cannot regress a committed session and a second commit cannot double-write.
 *
 * The pool is injectable (`q`) so the service is unit-tested against a
 * scripted fake; production resolves the shared pool lazily.
 *
 * @module server/services/cmc/interview-sessions
 */

import type { FlowCategory, FlowState } from '../../../shared/types/intelligence-questions.js';

export type InterviewSessionStatus = 'active' | 'complete' | 'committed' | 'abandoned';

/** One register record a commit produced — see interview-commit.ts. */
export interface CommittedRecordRef {
  /** The plan entry key (register + source nodes) — the idempotency key of a retry. */
  key: string;
  register: string;
  id: string | number;
  module3Linked?: boolean;
  module3Warning?: string;
  committedAt: string;
}

export interface InterviewSession {
  id: string;
  organizationId: number;
  projectId: string | null;
  userId: number | null;
  flowId: string;
  flowCategory: FlowCategory;
  state: FlowState;
  status: InterviewSessionStatus;
  committedRecordRefs: CommittedRecordRef[] | null;
  createdAt: string;
  updatedAt: string;
}

/** The slice of a pg Pool / PoolClient this module needs. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export type InterviewSessionErrorCode =
  | 'ORGANIZATION_REQUIRED'
  | 'INVALID_SESSION_ID'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_WRITABLE'
  | 'SESSION_STATE_INVALID'
  | 'COMMIT_REFS_REQUIRED';

export class InterviewSessionError extends Error {
  constructor(public readonly code: InterviewSessionErrorCode, message: string) {
    super(message);
    this.name = 'InterviewSessionError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RETURNING =
  `RETURNING id, organization_id, project_id, user_id, flow_id, flow_category,
             state, status, committed_record_refs, created_at, updated_at`;

/* ── Guards ────────────────────────────────────────────────────────────────── */

function assertOrganizationId(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
    throw new InterviewSessionError(
      'ORGANIZATION_REQUIRED',
      'An active organization context is required to use a persisted interview session.',
    );
  }
  return n;
}

function assertSessionId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!UUID_RE.test(id)) {
    throw new InterviewSessionError('INVALID_SESSION_ID', 'session_id must be the uuid returned by start_intelligence_flow.');
  }
  return id;
}

/**
 * The stored state must be a FlowState. A row whose state cannot be read is
 * reported as such — never as an empty interview, which would let a resume
 * silently restart from the first question over a corrupt payload.
 */
function readFlowState(value: unknown): FlowState {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new InterviewSessionError('SESSION_STATE_INVALID', 'The stored interview state could not be read.');
    }
  }
  const s = raw as Partial<FlowState> | null;
  if (
    !s || typeof s !== 'object' ||
    typeof s.flowId !== 'string' || typeof s.flowCategory !== 'string' ||
    typeof s.currentNodeId !== 'string' ||
    !s.answers || typeof s.answers !== 'object' || Array.isArray(s.answers) ||
    !Array.isArray(s.completedNodes) || typeof s.complete !== 'boolean'
  ) {
    throw new InterviewSessionError('SESSION_STATE_INVALID', 'The interview state is not a FlowState.');
  }
  return s as FlowState;
}

function readRefs(value: unknown): CommittedRecordRef[] | null {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return Array.isArray(raw) ? (raw as CommittedRecordRef[]) : null;
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function mapRow(row: Record<string, any>): InterviewSession {
  return {
    id: String(row.id),
    organizationId: Number(row.organization_id),
    projectId: row.project_id == null ? null : String(row.project_id),
    userId: row.user_id == null ? null : Number(row.user_id),
    flowId: String(row.flow_id),
    flowCategory: String(row.flow_category) as FlowCategory,
    state: readFlowState(row.state),
    status: String(row.status) as InterviewSessionStatus,
    committedRecordRefs: readRefs(row.committed_record_refs),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function resolveQueryable(q?: Queryable): Promise<Queryable> {
  if (q) return q;
  const { getPool } = await import('../../db.js');
  return getPool();
}

/* ── Lifecycle ─────────────────────────────────────────────────────────────── */

export async function createInterviewSession(
  params: {
    organizationId: number | string | null | undefined;
    userId: number | string | null | undefined;
    projectId: string | null | undefined;
    state: FlowState;
  },
  q?: Queryable,
): Promise<InterviewSession> {
  const organizationId = assertOrganizationId(params.organizationId);
  const state = readFlowState(params.state);
  const userId =
    params.userId == null || params.userId === '' ? null : Number(params.userId);
  const projectId = typeof params.projectId === 'string' && params.projectId.trim() ? params.projectId.trim() : null;

  const db = await resolveQueryable(q);
  const { rows } = await db.query(
    `INSERT INTO cmc_interview_sessions
       (organization_id, project_id, user_id, flow_id, flow_category, state, status)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'active')
     ${RETURNING}`,
    [organizationId, projectId, Number.isFinite(userId as number) ? userId : null, state.flowId, state.flowCategory, JSON.stringify(state)],
  );
  if (!rows[0]) {
    throw new InterviewSessionError('SESSION_NOT_WRITABLE', 'The interview session could not be created.');
  }
  return mapRow(rows[0]);
}

export async function loadInterviewSession(
  params: { organizationId: number | string | null | undefined; sessionId: unknown },
  q?: Queryable,
): Promise<InterviewSession> {
  const organizationId = assertOrganizationId(params.organizationId);
  const sessionId = assertSessionId(params.sessionId);

  const db = await resolveQueryable(q);
  const { rows } = await db.query(
    `SELECT id, organization_id, project_id, user_id, flow_id, flow_category,
            state, status, committed_record_refs, created_at, updated_at
       FROM cmc_interview_sessions
      WHERE id = $1 AND organization_id = $2`,
    [sessionId, organizationId],
  );
  if (!rows[0]) {
    // One message for "does not exist" and "belongs to another tenant".
    throw new InterviewSessionError('SESSION_NOT_FOUND', `No interview session ${sessionId} in this organization.`);
  }
  return mapRow(rows[0]);
}

/** One answered step: the state after `advanceFlow`, on a still-active session. */
export async function saveInterviewSessionState(
  params: { organizationId: number | string | null | undefined; sessionId: unknown; state: FlowState },
  q?: Queryable,
): Promise<InterviewSession> {
  const organizationId = assertOrganizationId(params.organizationId);
  const sessionId = assertSessionId(params.sessionId);
  const state = readFlowState(params.state);
  if (state.complete) {
    throw new InterviewSessionError(
      'SESSION_STATE_INVALID',
      'A complete FlowState is recorded with completeInterviewSession, not as an ordinary step.',
    );
  }

  const db = await resolveQueryable(q);
  const { rows } = await db.query(
    `UPDATE cmc_interview_sessions
        SET state = $3::jsonb, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status = 'active'
      ${RETURNING}`,
    [sessionId, organizationId, JSON.stringify(state)],
  );
  if (!rows[0]) {
    throw new InterviewSessionError(
      'SESSION_NOT_WRITABLE',
      `Interview session ${sessionId} is not an active session of this organization; the answer was not recorded.`,
    );
  }
  return mapRow(rows[0]);
}

/** The terminal step: the flow reached its last node. active → complete. */
export async function completeInterviewSession(
  params: { organizationId: number | string | null | undefined; sessionId: unknown; state: FlowState },
  q?: Queryable,
): Promise<InterviewSession> {
  const organizationId = assertOrganizationId(params.organizationId);
  const sessionId = assertSessionId(params.sessionId);
  const state = readFlowState(params.state);
  if (!state.complete) {
    throw new InterviewSessionError('SESSION_STATE_INVALID', 'Only a complete FlowState can complete a session.');
  }

  const db = await resolveQueryable(q);
  const { rows } = await db.query(
    `UPDATE cmc_interview_sessions
        SET state = $3::jsonb, status = 'complete', updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status = 'active'
      ${RETURNING}`,
    [sessionId, organizationId, JSON.stringify(state)],
  );
  if (!rows[0]) {
    throw new InterviewSessionError(
      'SESSION_NOT_WRITABLE',
      `Interview session ${sessionId} is not an active session of this organization; the completion was not recorded.`,
    );
  }
  return mapRow(rows[0]);
}

/** Close a session without committing it. A committed session cannot be abandoned. */
export async function abandonInterviewSession(
  params: { organizationId: number | string | null | undefined; sessionId: unknown },
  q?: Queryable,
): Promise<InterviewSession> {
  const organizationId = assertOrganizationId(params.organizationId);
  const sessionId = assertSessionId(params.sessionId);

  const db = await resolveQueryable(q);
  const { rows } = await db.query(
    `UPDATE cmc_interview_sessions
        SET status = 'abandoned', updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status IN ('active', 'complete')
      ${RETURNING}`,
    [sessionId, organizationId],
  );
  if (!rows[0]) {
    throw new InterviewSessionError(
      'SESSION_NOT_WRITABLE',
      `Interview session ${sessionId} is not an open session of this organization.`,
    );
  }
  return mapRow(rows[0]);
}

/**
 * The refs of a PARTIAL commit. The status stays 'complete': the commit did
 * not finish, and saying so is the point — but what it DID write is on the
 * record, so a retry skips it instead of writing it twice.
 */
export async function recordCommittedRecordRefs(
  params: { organizationId: number | string | null | undefined; sessionId: unknown; refs: CommittedRecordRef[] },
  q?: Queryable,
): Promise<InterviewSession> {
  const organizationId = assertOrganizationId(params.organizationId);
  const sessionId = assertSessionId(params.sessionId);

  const db = await resolveQueryable(q);
  const { rows } = await db.query(
    `UPDATE cmc_interview_sessions
        SET committed_record_refs = $3::jsonb, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status = 'complete'
      ${RETURNING}`,
    [sessionId, organizationId, JSON.stringify(params.refs ?? [])],
  );
  if (!rows[0]) {
    throw new InterviewSessionError(
      'SESSION_NOT_WRITABLE',
      `Interview session ${sessionId} is not a complete session of this organization; the partial commit could not be recorded.`,
    );
  }
  return mapRow(rows[0]);
}

/** complete → committed, with every record the commit produced. */
export async function markInterviewSessionCommitted(
  params: { organizationId: number | string | null | undefined; sessionId: unknown; refs: CommittedRecordRef[] },
  q?: Queryable,
): Promise<InterviewSession> {
  const organizationId = assertOrganizationId(params.organizationId);
  const sessionId = assertSessionId(params.sessionId);
  if (!Array.isArray(params.refs) || params.refs.length === 0) {
    throw new InterviewSessionError('COMMIT_REFS_REQUIRED', 'A commit that wrote no record is not a commit.');
  }

  const db = await resolveQueryable(q);
  const { rows } = await db.query(
    `UPDATE cmc_interview_sessions
        SET status = 'committed', committed_record_refs = $3::jsonb, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status = 'complete'
      ${RETURNING}`,
    [sessionId, organizationId, JSON.stringify(params.refs)],
  );
  if (!rows[0]) {
    throw new InterviewSessionError(
      'SESSION_NOT_WRITABLE',
      `Interview session ${sessionId} is not a complete session of this organization; it was not marked committed.`,
    );
  }
  return mapRow(rows[0]);
}
