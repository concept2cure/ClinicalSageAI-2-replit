/**
 * Canonical CAPA / complaint / MDR / vigilance service.
 *
 * Public reads and writes require trusted caller identity and current canonical
 * programme/project access. Each mutation commits its state, vigilance event and
 * chained audit together on one connection. Transitions lock and re-read current
 * state; generated display codes retry within savepoints. The caller receives a
 * success audit receipt only after confirmed COMMIT, or an explicit readback
 * receipt when commit completion is unknown. No patient narrative is fabricated.
 */

import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm';

import { writeChainedAuditRow } from '../auditService';
import { capaContext, authorizeCapaProgram, visibleCapaPrograms, mutateCapa, readCapa, CapaPersistenceError, type CapaCaller } from './governed-context';
export { CapaAccessError, CapaPersistenceError } from './governed-context';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import {
  complaints,
  mdrEvents,
  capaRecords,
  capaActions,
  vigilanceEvents,
  HARM_LEVELS,
  SEVERITY_LEVELS,
} from '../../../shared/schema/capa-mdr';
import type {
  Complaint,
  ComplaintState,
  ComplaintSource,
  ComplaintChannel,
  HarmLevel,
  SeverityLevel,
  MdrEvent,
  MdrState,
  MdrJurisdiction,
  FdaMdrReportType,
  EuMdrSeverity,
  CapaRecord,
  CapaState,
  CapaSource,
  CapaType,
  RiskLevel,
  CapaAction,
  ActionState,
  ActionType,
  VigilanceEvent,
  VigilanceEventKind,
} from '../../../shared/schema/capa-mdr';

import { classify, unstatedTriageFacts, TRIAGE_FACT_VALUES, type TriageFact, type TriageInput } from './triageEngine';
import { computeReportDue, daysToDue } from './clockCalculator';
import {
  assertCapaTransition,
  assertComplaintTransition,
  assertMdrTransition,
  assertActionTransition,
} from './stateMachine';


// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class TenantAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantAccessError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * A complaint was offered without an assessment the intake needs.
 *
 * Patient harm drives the preliminary MDR reportability classification, so it
 * cannot be assumed. Both fields used to default ('none', 'minor'), and a
 * complaint nobody had assessed was classified "no MDR". The event facts the
 * classification also turns on (TRIAGE_FACTS) defaulted to false, and the
 * country to outside the EU, until 2026-10-26; they are required too.
 */
export class ComplaintAssessmentRequired extends Error {
  constructor(readonly field: 'patientHarm' | 'severityAssessment' | TriageFact, allowed: readonly string[]) {
    super(`${field} is required at intake and must be one of: ${allowed.join(', ')}`);
    this.name = 'ComplaintAssessmentRequired';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant guard — one DB roundtrip to confirm the program belongs to the org.
// ─────────────────────────────────────────────────────────────────────────────

async function assertProgramAccess(organizationId: number, programId: string): Promise<void> {
  if (capaContext().organizationId !== organizationId) throw new TenantAccessError('Programme access denied.');
  await authorizeCapaProgram(programId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Code generation — display ids like CMP-2025-0001 / MDR-2025-0001 / CAPA-2025-0001
// ─────────────────────────────────────────────────────────────────────────────

function yearPrefix(): string {
  return new Date().getUTCFullYear().toString();
}

/**
 * The next display code for a program: CMP-2025-0001, MDR-2025-0001,
 * CAPA-2025-0001.
 *
 * Amended 2026-09-19, on two counts.
 *
 * It read `count(*)` for the program and added one. That is wrong whenever the
 * sequence has a gap — one removed row and the next create re-issues a code that
 * is already taken — and it ignored the year entirely, so the first record of
 * 2026 in a program that filed 12 in 2025 was handed 0013 rather than 0001.
 * It now takes the maximum sequence already issued FOR THIS PROGRAM AND YEAR and
 * increments that, which is gap-proof and year-correct.
 *
 * Its old comment also said: "in practice the (programId, code) unique index
 * will reject duplicates and the caller can retry." Neither half was true. The
 * index was on the code column ALONE, so it rejected duplicates ACROSS programs
 * — meaning the second program in the whole deployment to open its first record
 * of a year failed 23505 on the normal path, not on a race. And no caller
 * retried anything. The index is now (program_id, code) as that comment always
 * described (migrations/20260504_capa_mdr.sql plus the conversion file
 * migrations/20260919_capa_code_uniqueness_per_program.sql), and the retry the
 * comment promised is implemented in insertWithCode below.
 */
async function nextCode(
  prefix: string,
  programId: string,
  table: 'complaint' | 'mdr' | 'capa'
): Promise<string> {
  const year = yearPrefix();
  const codeColumn =
    table === 'complaint'
      ? complaints.complaintCode
      : table === 'mdr'
      ? mdrEvents.mdrCode
      : capaRecords.capaCode;
  const from = table === 'complaint' ? complaints : table === 'mdr' ? mdrEvents : capaRecords;
  const programColumn =
    table === 'complaint'
      ? complaints.programId
      : table === 'mdr'
      ? mdrEvents.programId
      : capaRecords.programId;

  // Read the trailing sequence off this program's codes for this year only. The
  // cast is safe because the LIKE pins the shape to <prefix>-<year>-<digits>.
  const [row] = await capaContext().db
    .select({
      maxSeq: sql<number | null>`max(
        nullif(regexp_replace(${codeColumn}, '^.*-', ''), '')::int
      )`,
    })
    .from(from)
    .where(and(eq(programColumn, programId), like(codeColumn, `${prefix}-${year}-%`)));

  const seq = String((row?.maxSeq ?? 0) + 1).padStart(4, '0');
  return `${prefix}-${year}-${seq}`;
}

/** Postgres unique-violation. */
function isDuplicateCode(e: unknown): boolean {
  for (let depth = 0; depth < 4 && e && typeof e === 'object'; depth++) {
    const candidate = e as { code?: string; cause?: unknown };
    if (candidate.code === '23505') return true;
    e = candidate.cause;
  }
  return false;
}

/**
 * Generate a display code, insert with it, and retry on the per-program unique
 * index — the retry nextCode's comment promised for years and nothing supplied.
 *
 * nextCode reads the current maximum and the insert writes max+1, so two creates
 * racing in one program can compute the same code. That is now a real collision
 * rather than a silent overwrite, because the index catches it; without a retry
 * it would surface to the caller as 500 "Operation failed". Bounded at four
 * attempts: each retry re-reads the maximum, so under contention the attempts
 * converge instead of fighting, and a non-duplicate error is rethrown untouched
 * on the first try rather than being retried blindly.
 *
 * Returns the code alongside the row because a retry means the caller cannot
 * know which attempt won, and all three creates put the code in their vigilance
 * payload.
 */
async function insertWithCode<T>(
  prefix: string,
  programId: string,
  table: 'complaint' | 'mdr' | 'capa',
  insert: (code: string) => Promise<T[]>
): Promise<{ row: T; code: string }> {
  const ATTEMPTS = 4;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const code = await nextCode(prefix, programId, table);
    await capaContext().q.query('SAVEPOINT capa_code_attempt');
    try {
      const [row] = await insert(code);
      await capaContext().q.query('RELEASE SAVEPOINT capa_code_attempt');
      return { row, code };
    } catch (e) {
      await capaContext().q.query('ROLLBACK TO SAVEPOINT capa_code_attempt');
      await capaContext().q.query('RELEASE SAVEPOINT capa_code_attempt');
      if (!isDuplicateCode(e) || attempt === ATTEMPTS) throw e;
    }
  }
  /* Unreachable: the loop either returns or throws. */
  throw new Error(`${prefix} code generation exhausted ${ATTEMPTS} attempts`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit emission — wraps both the structured audit log and the per-program
// vigilance_events timeline so the UI has a single feed to render.
// ─────────────────────────────────────────────────────────────────────────────

async function recordVigilance(opts: {
  organizationId: number;
  programId: string;
  kind: VigilanceEventKind;
  entityType: 'complaint' | 'mdr_event' | 'capa_record' | 'capa_action';
  entityId: string;
  actor?: string | null;
  actorRole?: string | null;
  occurredAt?: Date;
  payload?: Record<string, unknown> | null;
  reason?: string | null;
}): Promise<VigilanceEvent> {
  const occurredAt = opts.occurredAt ?? new Date();
  const active = capaContext();

  const [row] = await capaContext().db
    .insert(vigilanceEvents)
    .values({
      programId: opts.programId,
      kind: opts.kind,
      entityType: opts.entityType,
      entityId: opts.entityId,
      actor: String(active.caller.userId),
      actorRole: active.role,
      occurredAt,
      payload: opts.payload ?? null,
      reason: opts.reason ?? null,
    })
    .returning();

  // Critical governance is enlisted with state and timeline, never mirrored
  // after the business transaction has already committed.
  try {
    await writeChainedAuditRow(active.q, { organizationId: active.organizationId,
      userId: active.caller.userId, action: opts.kind, resourceType: opts.entityType,
      resourceId: opts.entityId, reason: opts.reason ?? undefined,
      details: { programId: opts.programId, payload: opts.payload, reason: opts.reason } });
  } catch { throw new CapaPersistenceError('CAPA_AUDIT_UNAVAILABLE'); }
  active.auditWrites++;
  const collection = { complaint: 'complaints', mdr_event: 'mdr-events', capa_record: 'capa', capa_action: 'capa' }[opts.entityType];
  const recoveryId = opts.entityType === 'capa_action' ? String(opts.payload?.capaId) : opts.entityId;
  active.recovery = { recordId: opts.entityId, recoveryUrl: `/api/capa-mdr/${collection}/${encodeURIComponent(recoveryId)}` };

  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Complaints
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateComplaintInput {
  programId: string;
  source: ComplaintSource;
  channel: ComplaintChannel;
  receivedAt: Date;
  reporter?: Record<string, unknown> | null;
  deviceUdiDi?: string | null;
  deviceLot?: string | null;
  deviceSerial?: string | null;
  deviceModel?: string | null;
  eventDate?: Date | null;
  /** Required: an ISO 3166-1 alpha-2 code, or 'unknown'. */
  eventLocationCountry: string;
  eventNarrative: string;
  /** Required: the intake classification is computed from it. */
  patientHarm: HarmLevel;
  severityAssessment: SeverityLevel;
  /** Required, as the country is: the classification turns on them, so none is assumed false. */
  isMalfunction: boolean;
  anticipatesCorrection: boolean;
  trendThresholdCrossed: boolean;
  createdBy?: string | null;
}

/** Intake assessments are required before a database transaction is acquired. */
function requireComplaintAssessments(input: CreateComplaintInput): void {
  if (!(HARM_LEVELS as readonly string[]).includes(input.patientHarm)) {
    throw new ComplaintAssessmentRequired('patientHarm', HARM_LEVELS);
  }
  if (!(SEVERITY_LEVELS as readonly string[]).includes(input.severityAssessment)) {
    throw new ComplaintAssessmentRequired('severityAssessment', SEVERITY_LEVELS);
  }
  const [unstated] = unstatedTriageFacts(input);
  if (unstated) throw new ComplaintAssessmentRequired(unstated, TRIAGE_FACT_VALUES[unstated]);
}

async function createComplaintTx(
  organizationId: number,
  input: CreateComplaintInput
): Promise<Complaint> {
  await assertProgramAccess(organizationId, input.programId);

  const triageInput: TriageInput = {
    patientHarm: input.patientHarm,
    isMalfunction: input.isMalfunction,
    eventLocationCountry: input.eventLocationCountry,
    anticipatesCorrection: input.anticipatesCorrection,
    trendThresholdCrossed: input.trendThresholdCrossed,
    eventNarrative: input.eventNarrative,
  };
  const classification = classify(triageInput);

  const { row, code } = await insertWithCode('CMP', input.programId, 'complaint', generated =>
    capaContext().db
      .insert(complaints)
      .values({
        programId: input.programId,
        complaintCode: generated,
        source: input.source,
        channel: input.channel,
        receivedAt: input.receivedAt,
        reporter: input.reporter ?? null,
        deviceUdiDi: input.deviceUdiDi ?? null,
        deviceLot: input.deviceLot ?? null,
        deviceSerial: input.deviceSerial ?? null,
        deviceModel: input.deviceModel ?? null,
        eventDate: input.eventDate ?? null,
        eventLocationCountry: input.eventLocationCountry ?? null,
        eventNarrative: input.eventNarrative,
        patientHarm: input.patientHarm,
        severityAssessment: input.severityAssessment,
        preliminaryClassification: classification,
        triageState: 'new',
        createdBy: input.createdBy ?? null,
        updatedBy: input.createdBy ?? null,
      })
      .returning()
  );

  await recordVigilance({
    organizationId,
    programId: input.programId,
    kind: 'complaint_received',
    entityType: 'complaint',
    entityId: row.id,
    actor: input.createdBy ?? null,
    occurredAt: input.receivedAt,
    payload: { complaintCode: code, classification },
  });

  return row;
}

export interface ListComplaintsFilters {
  programId?: string;
  state?: ComplaintState;
  source?: ComplaintSource;
  severity?: SeverityLevel;
  openOnly?: boolean;
  limit?: number;
}

async function listComplaintsTx(
  organizationId: number,
  filters: ListComplaintsFilters = {}
): Promise<Complaint[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const programs = await visibleCapaPrograms(filters.programId);
  if (!programs.length) return [];
  const conds = [eq(regulatoryPrograms.organizationId, organizationId), inArray(complaints.programId, programs)];
  if (filters.state) conds.push(eq(complaints.triageState, filters.state));
  if (filters.source) conds.push(eq(complaints.source, filters.source));
  if (filters.severity) conds.push(eq(complaints.severityAssessment, filters.severity));
  if (filters.openOnly) {
    conds.push(sql`${complaints.triageState} <> 'closed'`);
  }

  const rows = await capaContext().db
    .select({ row: complaints })
    .from(complaints)
    .innerJoin(regulatoryPrograms, eq(regulatoryPrograms.id, sql`${complaints.programId}::uuid`))
    .where(and(...conds))
    .orderBy(desc(complaints.receivedAt))
    .limit(limit);

  return rows.map(r => r.row);
}

async function getComplaintTx(organizationId: number, id: string): Promise<Complaint | null> {
  const [row] = await capaContext().db
    .select({ row: complaints })
    .from(complaints)
    .innerJoin(regulatoryPrograms, eq(regulatoryPrograms.id, sql`${complaints.programId}::uuid`))
    .where(and(eq(complaints.id, id), eq(regulatoryPrograms.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  await assertProgramAccess(organizationId, row.row.programId);
  if (!capaContext().write) return row.row;
  const [current] = await capaContext().db.select().from(complaints)
    .where(and(eq(complaints.id, id), eq(complaints.programId, row.row.programId))).for('update');
  return current ?? null;
}

export interface TransitionComplaintInput {
  to: ComplaintState;
  triageDecision?: Record<string, unknown> | null;
  closureReason?: string | null;
  reason?: string | null; // 21 CFR Part 11 reason-for-change
  actor?: string | null;
  actorRole?: string | null;
}

async function transitionComplaintTx(
  organizationId: number,
  id: string,
  input: TransitionComplaintInput
): Promise<Complaint> {
  const current = await getComplaintTx(organizationId, id);
  if (!current) throw new NotFoundError(`Complaint ${id} not found`);
  assertComplaintTransition(current.triageState as ComplaintState, input.to);

  const now = new Date();
  const update: Partial<Complaint> = {
    triageState: input.to,
    updatedAt: now,
    updatedBy: input.actor ?? null,
  };
  if (input.to === 'triaged') {
    update.triagedAt = now;
    update.triagedBy = input.actor ?? null;
    if (input.triageDecision !== undefined) update.triageDecision = input.triageDecision ?? null;
  }
  if (input.to === 'closed') {
    update.closedAt = now;
    update.closedBy = input.actor ?? null;
    update.closureReason = input.closureReason ?? null;
  }

  const [row] = await capaContext().db.update(complaints).set(update).where(eq(complaints.id, id)).returning();

  await recordVigilance({
    organizationId,
    programId: current.programId,
    kind: input.to === 'triaged' ? 'complaint_triaged' : 'complaint_state_changed',
    entityType: 'complaint',
    entityId: id,
    actor: input.actor ?? null,
    actorRole: input.actorRole ?? null,
    occurredAt: now,
    payload: {
      from: current.triageState,
      to: input.to,
      triageDecision: input.triageDecision ?? null,
    },
    reason: input.reason ?? null,
  });

  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// MDR events
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateMdrEventInput {
  programId: string;
  sourceComplaintId?: string | null;
  jurisdiction: MdrJurisdiction;
  usFdaReportType?: FdaMdrReportType | null;
  euMdrSeverity?: EuMdrSeverity | null;
  decisionDate: Date;
  eventNarrative: string;
  fdaPatientCode?: string | null;
  fdaDeviceProblemCode?: string | null;
  fdaHealthEffectCode?: string | null;
  patientOutcome?: string | null;
  correctionsTaken?: string | null;
  attachmentRefs?: unknown[];
  createdBy?: string | null;
}

async function createMdrEventTx(
  organizationId: number,
  input: CreateMdrEventInput
): Promise<MdrEvent> {
  await assertProgramAccess(organizationId, input.programId);
  // The complaint this event is sourced from must be one this org can see.
  // The actual source must be in this programme. Canonical child RLS also
  // scopes complaints through its parent; neither substitutes for this link check.
  if (input.sourceComplaintId) {
    const [bound] = await capaContext().db.select({ id: complaints.id }).from(complaints)
      .where(and(eq(complaints.id, input.sourceComplaintId), eq(complaints.programId, input.programId))).limit(1);
    if (!bound) throw new NotFoundError('Source complaint not found in this programme.');
    const source = await getComplaintTx(organizationId, input.sourceComplaintId);
    if (!source || source.programId !== input.programId) throw new NotFoundError('Source complaint not found in this programme.');
  }

  const clock = computeReportDue({
    jurisdiction: input.jurisdiction,
    decisionDate: input.decisionDate,
    usFdaReportType: input.usFdaReportType ?? null,
    euMdrSeverity: input.euMdrSeverity ?? null,
  });

  const days = daysToDue(clock.reportDueAt);

  const { row, code } = await insertWithCode('MDR', input.programId, 'mdr', generated =>
    capaContext().db
      .insert(mdrEvents)
      .values({
        programId: input.programId,
        mdrCode: generated,
        sourceComplaintId: input.sourceComplaintId ?? null,
        jurisdiction: input.jurisdiction,
        usFdaReportType: input.usFdaReportType ?? null,
        euMdrSeverity: input.euMdrSeverity ?? null,
        decisionDate: input.decisionDate,
        reportDueAt: clock.reportDueAt,
        daysToDue: days,
        eventNarrative: input.eventNarrative,
        fdaPatientCode: input.fdaPatientCode ?? null,
        fdaDeviceProblemCode: input.fdaDeviceProblemCode ?? null,
        fdaHealthEffectCode: input.fdaHealthEffectCode ?? null,
        patientOutcome: input.patientOutcome ?? null,
        correctionsTaken: input.correctionsTaken ?? null,
        attachmentRefs: input.attachmentRefs ?? null,
        state: 'open',
        createdBy: input.createdBy ?? null,
        updatedBy: input.createdBy ?? null,
      })
      .returning()
  );

  await recordVigilance({
    organizationId,
    programId: input.programId,
    kind: 'mdr_opened',
    entityType: 'mdr_event',
    entityId: row.id,
    actor: input.createdBy ?? null,
    payload: { mdrCode: code, jurisdiction: input.jurisdiction, clock },
  });

  // If sourced from a complaint, flip the complaint's linkedMdrEventId.
  if (input.sourceComplaintId) {
    await capaContext().db
      .update(complaints)
      .set({ linkedMdrEventId: row.id, updatedAt: new Date(), updatedBy: String(capaContext().caller.userId) })
      .where(eq(complaints.id, input.sourceComplaintId));
  }

  return row;
}

export interface ListMdrFilters {
  programId?: string;
  state?: MdrState;
  jurisdiction?: MdrJurisdiction;
  overdueOnly?: boolean;
  limit?: number;
}

async function listMdrEventsTx(
  organizationId: number,
  filters: ListMdrFilters = {}
): Promise<MdrEvent[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const programs = await visibleCapaPrograms(filters.programId);
  if (!programs.length) return [];
  const conds = [eq(regulatoryPrograms.organizationId, organizationId), inArray(mdrEvents.programId, programs)];
  if (filters.state) conds.push(eq(mdrEvents.state, filters.state));
  if (filters.jurisdiction) conds.push(eq(mdrEvents.jurisdiction, filters.jurisdiction));
  if (filters.overdueOnly) {
    conds.push(
      sql`${mdrEvents.reportDueAt} < now() AND ${mdrEvents.state} NOT IN ('filed','acknowledged','closed')`
    );
  }

  const rows = await capaContext().db
    .select({ row: mdrEvents })
    .from(mdrEvents)
    .innerJoin(regulatoryPrograms, eq(regulatoryPrograms.id, sql`${mdrEvents.programId}::uuid`))
    .where(and(...conds))
    .orderBy(asc(mdrEvents.reportDueAt))
    .limit(limit);

  // Refresh daysToDue at read time (denormalized field can drift).
  return rows.map(r => ({ ...r.row, daysToDue: daysToDue(r.row.reportDueAt) }));
}

async function getMdrEventTx(organizationId: number, id: string): Promise<MdrEvent | null> {
  const [row] = await capaContext().db
    .select({ row: mdrEvents })
    .from(mdrEvents)
    .innerJoin(regulatoryPrograms, eq(regulatoryPrograms.id, sql`${mdrEvents.programId}::uuid`))
    .where(and(eq(mdrEvents.id, id), eq(regulatoryPrograms.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  await assertProgramAccess(organizationId, row.row.programId);
  if (!capaContext().write) return { ...row.row, daysToDue: daysToDue(row.row.reportDueAt) };
  const [current] = await capaContext().db.select().from(mdrEvents)
    .where(and(eq(mdrEvents.id, id), eq(mdrEvents.programId, row.row.programId))).for('update');
  return current ? { ...current, daysToDue: daysToDue(current.reportDueAt) } : null;
}

export interface TransitionMdrInput {
  to: MdrState;
  reason?: string | null;
  actor?: string | null;
  actorRole?: string | null;
  fdaReportNumber?: string | null;
  euReportNumber?: string | null;
  reportConfirmationCode?: string | null;
}

async function transitionMdrEventTx(
  organizationId: number,
  id: string,
  input: TransitionMdrInput
): Promise<MdrEvent> {
  const current = await getMdrEventTx(organizationId, id);
  if (!current) throw new NotFoundError(`MDR event ${id} not found`);
  assertMdrTransition(current.state as MdrState, input.to);

  const now = new Date();
  const update: Partial<MdrEvent> = {
    state: input.to,
    updatedAt: now,
    updatedBy: input.actor ?? null,
  };
  if (input.to === 'filed') {
    update.reportFiledAt = now;
    if (input.fdaReportNumber !== undefined) update.fdaReportNumber = input.fdaReportNumber ?? null;
    if (input.euReportNumber !== undefined) update.euReportNumber = input.euReportNumber ?? null;
    if (input.reportConfirmationCode !== undefined) {
      update.reportConfirmationCode = input.reportConfirmationCode ?? null;
    }
  }

  const [row] = await capaContext().db.update(mdrEvents).set(update).where(eq(mdrEvents.id, id)).returning();

  const kind: VigilanceEventKind =
    input.to === 'filed'
      ? 'mdr_filed'
      : input.to === 'acknowledged'
      ? 'mdr_acknowledged'
      : 'mdr_state_changed';

  await recordVigilance({
    organizationId,
    programId: current.programId,
    kind,
    entityType: 'mdr_event',
    entityId: id,
    actor: input.actor ?? null,
    actorRole: input.actorRole ?? null,
    occurredAt: now,
    payload: { from: current.state, to: input.to },
    reason: input.reason ?? null,
  });

  return { ...row, daysToDue: daysToDue(row.reportDueAt) };
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPA records
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCapaInput {
  programId: string;
  title: string;
  summary?: string | null;
  type: CapaType;
  source: CapaSource;
  sourceRefs?: unknown[];
  riskLevel?: RiskLevel;
  assignedTo?: string | null;
  targetCloseDate?: Date | null;
  problemStatement?: string | null;
  createdBy?: string | null;
}

async function createCapaRecordTx(
  organizationId: number,
  input: CreateCapaInput
): Promise<CapaRecord> {
  await assertProgramAccess(organizationId, input.programId);
  const { row, code } = await insertWithCode('CAPA', input.programId, 'capa', generated =>
    capaContext().db
      .insert(capaRecords)
      .values({
        programId: input.programId,
        capaCode: generated,
        title: input.title,
        summary: input.summary ?? null,
        type: input.type,
        source: input.source,
        sourceRefs: input.sourceRefs ?? null,
        riskLevel: input.riskLevel ?? 'medium',
        assignedTo: input.assignedTo ?? null,
        targetCloseDate: input.targetCloseDate ?? null,
        problemStatement: input.problemStatement ?? null,
        state: 'open',
        createdBy: input.createdBy ?? null,
        updatedBy: input.createdBy ?? null,
      })
      .returning()
  );

  await recordVigilance({
    organizationId,
    programId: input.programId,
    kind: 'capa_opened',
    entityType: 'capa_record',
    entityId: row.id,
    actor: input.createdBy ?? null,
    payload: { capaCode: code, source: input.source, riskLevel: row.riskLevel },
  });

  return row;
}

export interface ListCapaFilters {
  programId?: string;
  state?: CapaState;
  source?: CapaSource;
  riskLevel?: RiskLevel;
  openOnly?: boolean;
  limit?: number;
}

async function listCapaRecordsTx(
  organizationId: number,
  filters: ListCapaFilters = {}
): Promise<CapaRecord[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const programs = await visibleCapaPrograms(filters.programId);
  if (!programs.length) return [];
  const conds = [eq(regulatoryPrograms.organizationId, organizationId), inArray(capaRecords.programId, programs)];
  if (filters.state) conds.push(eq(capaRecords.state, filters.state));
  if (filters.source) conds.push(eq(capaRecords.source, filters.source));
  if (filters.riskLevel) conds.push(eq(capaRecords.riskLevel, filters.riskLevel));
  if (filters.openOnly) {
    conds.push(sql`${capaRecords.state} NOT IN ('closed_effective','closed_not_effective')`);
  }

  const rows = await capaContext().db
    .select({ row: capaRecords })
    .from(capaRecords)
    .innerJoin(regulatoryPrograms, eq(regulatoryPrograms.id, sql`${capaRecords.programId}::uuid`))
    .where(and(...conds))
    .orderBy(desc(capaRecords.updatedAt))
    .limit(limit);

  return rows.map(r => r.row);
}

export interface CapaDetail extends CapaRecord {
  actions: CapaAction[];
}

async function getCapaRecordTx(
  organizationId: number,
  id: string
): Promise<CapaDetail | null> {
  const [row] = await capaContext().db
    .select({ row: capaRecords })
    .from(capaRecords)
    .innerJoin(regulatoryPrograms, eq(regulatoryPrograms.id, sql`${capaRecords.programId}::uuid`))
    .where(and(eq(capaRecords.id, id), eq(regulatoryPrograms.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  await assertProgramAccess(organizationId, row.row.programId);
  let current = row.row;
  if (capaContext().write) {
    const locked = await capaContext().db.select().from(capaRecords)
      .where(and(eq(capaRecords.id, id), eq(capaRecords.programId, row.row.programId))).for('update');
    if (!locked[0]) return null;
    current = locked[0];
  }

  const actions = await capaContext().db
    .select()
    .from(capaActions)
    .where(eq(capaActions.capaId, id))
    .orderBy(asc(capaActions.n));

  return { ...current, actions };
}

export interface TransitionCapaInput {
  to: CapaState;
  reason?: string | null;
  actor?: string | null;
  actorRole?: string | null;
  effectivenessCheckResult?: Record<string, unknown> | null;
}

async function transitionCapaTx(
  organizationId: number,
  id: string,
  input: TransitionCapaInput
): Promise<CapaRecord> {
  const current = await getCapaRecordTx(organizationId, id);
  if (!current) throw new NotFoundError(`CAPA ${id} not found`);
  assertCapaTransition(current.state as CapaState, input.to);

  const now = new Date();
  const update: Partial<CapaRecord> = {
    state: input.to,
    updatedAt: now,
    updatedBy: input.actor ?? null,
  };
  if (input.to === 'closed_effective' || input.to === 'closed_not_effective') {
    update.closedAt = now;
    update.closedBy = input.actor ?? null;
    if (input.effectivenessCheckResult !== undefined) {
      update.effectivenessCheckResult = input.effectivenessCheckResult ?? null;
    }
  }

  const [row] = await capaContext().db.update(capaRecords).set(update).where(eq(capaRecords.id, id)).returning();

  const kind: VigilanceEventKind =
    input.to === 'closed_effective' || input.to === 'closed_not_effective'
      ? 'capa_closed'
      : input.to === 'effectiveness_check'
      ? 'capa_effectiveness_verified'
      : 'capa_state_changed';

  await recordVigilance({
    organizationId,
    programId: current.programId,
    kind,
    entityType: 'capa_record',
    entityId: id,
    actor: input.actor ?? null,
    actorRole: input.actorRole ?? null,
    occurredAt: now,
    payload: {
      from: current.state,
      to: input.to,
      effectiveness: input.effectivenessCheckResult ?? null,
    },
    reason: input.reason ?? null,
  });

  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPA actions
// ─────────────────────────────────────────────────────────────────────────────

export interface AddCapaActionInput {
  capaId: string;
  type: ActionType;
  description: string;
  owner?: string | null;
  dueDate?: Date | null;
  actor?: string | null;
}

async function addCapaActionTx(
  organizationId: number,
  input: AddCapaActionInput
): Promise<CapaAction> {
  // Verify the parent CAPA belongs to the org.
  const parent = await getCapaRecordTx(organizationId, input.capaId);
  if (!parent) throw new NotFoundError(`CAPA ${input.capaId} not found`);

  const [{ next }] = await capaContext().db
    .select({ next: sql<number>`coalesce(max(${capaActions.n}), 0) + 1` })
    .from(capaActions)
    .where(eq(capaActions.capaId, input.capaId));

  const [row] = await capaContext().db
    .insert(capaActions)
    .values({
      capaId: input.capaId,
      n: next,
      type: input.type,
      description: input.description,
      owner: input.owner ?? null,
      dueDate: input.dueDate ?? null,
      state: 'planned',
    })
    .returning();

  await recordVigilance({
    organizationId,
    programId: parent.programId,
    kind: 'capa_action_added',
    entityType: 'capa_action',
    entityId: row.id,
    actor: input.actor ?? null,
    payload: { capaId: input.capaId, n: next, type: input.type },
  });

  return row;
}

export interface UpdateCapaActionInput {
  to: ActionState;
  evidenceRefs?: unknown[];
  actor?: string | null;
  reason?: string | null;
}

async function transitionCapaActionTx(
  organizationId: number,
  actionId: string,
  input: UpdateCapaActionInput
): Promise<CapaAction> {
  // Tenant guard via a join.
  const rows = await capaContext().db
    .select({ action: capaActions, programId: capaRecords.programId })
    .from(capaActions)
    .innerJoin(capaRecords, eq(capaRecords.id, capaActions.capaId))
    .innerJoin(regulatoryPrograms, eq(regulatoryPrograms.id, sql`${capaRecords.programId}::uuid`))
    .where(and(eq(capaActions.id, actionId), eq(regulatoryPrograms.organizationId, organizationId)))
    .limit(1);
  const ctx = rows[0];
  if (!ctx) throw new NotFoundError(`Action ${actionId} not found`);
  await assertProgramAccess(organizationId, ctx.programId);
  const [currentAction] = await capaContext().db.select().from(capaActions)
    .where(and(eq(capaActions.id, actionId), eq(capaActions.capaId, ctx.action.capaId))).for('update');
  if (!currentAction) throw new NotFoundError('Action not found.');
  ctx.action = currentAction;

  assertActionTransition(ctx.action.state as ActionState, input.to);

  const now = new Date();
  const update: Partial<CapaAction> = {
    state: input.to,
    updatedAt: now,
  };
  if (input.to === 'done') {
    update.completedAt = now;
    update.completedBy = input.actor ?? null;
    if (input.evidenceRefs !== undefined) update.evidenceRefs = input.evidenceRefs as unknown;
  }

  const [row] = await capaContext().db
    .update(capaActions)
    .set(update)
    .where(eq(capaActions.id, actionId))
    .returning();

  await recordVigilance({
    organizationId,
    programId: ctx.programId,
    kind: input.to === 'done' ? 'capa_action_completed' : 'capa_state_changed',
    entityType: 'capa_action',
    entityId: actionId,
    actor: input.actor ?? null,
    occurredAt: now,
    payload: { capaId: ctx.action.capaId, from: ctx.action.state, to: input.to, evidenceRefs: input.evidenceRefs ?? null },
    reason: input.reason ?? null,
  });

  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vigilance timeline
// ─────────────────────────────────────────────────────────────────────────────

export interface ListVigilanceFilters {
  programId: string;
  entityType?: 'complaint' | 'mdr_event' | 'capa_record' | 'capa_action';
  entityId?: string;
  kind?: VigilanceEventKind;
  limit?: number;
}

async function listVigilanceEventsTx(
  organizationId: number,
  filters: ListVigilanceFilters
): Promise<VigilanceEvent[]> {
  await assertProgramAccess(organizationId, filters.programId);
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const conds = [eq(vigilanceEvents.programId, filters.programId)];
  if (filters.entityType) conds.push(eq(vigilanceEvents.entityType, filters.entityType));
  if (filters.entityId) conds.push(eq(vigilanceEvents.entityId, filters.entityId));
  if (filters.kind) conds.push(eq(vigilanceEvents.kind, filters.kind));
  return capaContext().db
    .select()
    .from(vigilanceEvents)
    .where(and(...conds))
    .orderBy(desc(vigilanceEvents.occurredAt))
    .limit(limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Triage queue — unified view across the three lifecycles
// ─────────────────────────────────────────────────────────────────────────────

export interface TriageQueueItem {
  kind: 'complaint' | 'mdr' | 'capa';
  id: string;
  programId: string;
  code: string;
  title: string;
  state: string;
  riskOrSeverity: string | null;
  receivedOrOpenedAt: string;
  dueAt: string | null;
  daysToDue: number | null;
  overdue: boolean;
}

export interface TriageQueueFilters {
  programId?: string;
  openOnly?: boolean;
  limit?: number;
}

async function getTriageQueueTx(
  organizationId: number,
  filters: TriageQueueFilters = {}
): Promise<TriageQueueItem[]> {
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const now = Date.now();

  const [openComplaints, openMdrs, openCapas] = await Promise.all([
    listComplaintsTx(organizationId, {
      programId: filters.programId,
      openOnly: filters.openOnly ?? true,
      limit,
    }),
    listMdrEventsTx(organizationId, {
      programId: filters.programId,
      limit,
    }),
    listCapaRecordsTx(organizationId, {
      programId: filters.programId,
      openOnly: filters.openOnly ?? true,
      limit,
    }),
  ]);

  const items: TriageQueueItem[] = [];

  for (const c of openComplaints) {
    items.push({
      kind: 'complaint',
      id: c.id,
      programId: c.programId,
      code: c.complaintCode,
      title: c.eventNarrative.slice(0, 120),
      state: c.triageState,
      riskOrSeverity: c.severityAssessment,
      receivedOrOpenedAt: c.receivedAt.toISOString(),
      dueAt: null,
      daysToDue: null,
      overdue: false,
    });
  }

  for (const m of openMdrs) {
    const due = m.reportDueAt ? m.reportDueAt.getTime() : null;
    items.push({
      kind: 'mdr',
      id: m.id,
      programId: m.programId,
      code: m.mdrCode,
      title: m.eventNarrative.slice(0, 120),
      state: m.state,
      riskOrSeverity: m.euMdrSeverity ?? m.usFdaReportType ?? m.jurisdiction,
      receivedOrOpenedAt: m.decisionDate.toISOString(),
      dueAt: m.reportDueAt ? m.reportDueAt.toISOString() : null,
      daysToDue: m.daysToDue ?? null,
      overdue:
        due !== null &&
        due < now &&
        m.state !== 'filed' &&
        m.state !== 'acknowledged' &&
        m.state !== 'closed',
    });
  }

  for (const r of openCapas) {
    const due = r.targetCloseDate ? r.targetCloseDate.getTime() : null;
    items.push({
      kind: 'capa',
      id: r.id,
      programId: r.programId,
      code: r.capaCode,
      title: r.title,
      state: r.state,
      riskOrSeverity: r.riskLevel,
      receivedOrOpenedAt: r.createdAt.toISOString(),
      dueAt: r.targetCloseDate ? r.targetCloseDate.toISOString() : null,
      daysToDue: r.targetCloseDate ? Math.ceil((due! - now) / (24 * 60 * 60 * 1000)) : null,
      overdue: due !== null && due < now,
    });
  }

  items.sort((a, b) => {
    // Overdue first, then by daysToDue ascending (nulls last), then by date.
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const ad = a.daysToDue ?? Number.POSITIVE_INFINITY;
    const bd = b.daysToDue ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return b.receivedOrOpenedAt.localeCompare(a.receivedOrOpenedAt);
  });

  return items.slice(0, limit);
}

// Public entrypoints require trusted caller identity for API and AnA alike.
// Display actor fields never determine service authority.
export async function createComplaint(org: number, input: CreateComplaintInput, caller: CapaCaller) {
  requireComplaintAssessments(input);
  return mutateCapa(org, caller, () => createComplaintTx(org, { ...input, createdBy: String(caller.userId) }));
}
export function transitionComplaint(org: number, id: string, input: TransitionComplaintInput, caller: CapaCaller) {
  return mutateCapa(org, caller, () => transitionComplaintTx(org, id, { ...input, actor: String(caller.userId) }));
}
export function createMdrEvent(org: number, input: CreateMdrEventInput, caller: CapaCaller) {
  return mutateCapa(org, caller, () => createMdrEventTx(org, { ...input, createdBy: String(caller.userId) }));
}
export function transitionMdrEvent(org: number, id: string, input: TransitionMdrInput, caller: CapaCaller) {
  return mutateCapa(org, caller, () => transitionMdrEventTx(org, id, { ...input, actor: String(caller.userId) }));
}
export function createCapaRecord(org: number, input: CreateCapaInput, caller: CapaCaller) {
  return mutateCapa(org, caller, () => createCapaRecordTx(org, { ...input, createdBy: String(caller.userId) }));
}
export function transitionCapa(org: number, id: string, input: TransitionCapaInput, caller: CapaCaller) {
  return mutateCapa(org, caller, () => transitionCapaTx(org, id, { ...input, actor: String(caller.userId) }));
}
export function addCapaAction(org: number, input: AddCapaActionInput, caller: CapaCaller) {
  return mutateCapa(org, caller, () => addCapaActionTx(org, { ...input, actor: String(caller.userId) }));
}
export function transitionCapaAction(org: number, id: string, input: UpdateCapaActionInput, caller: CapaCaller) {
  return mutateCapa(org, caller, () => transitionCapaActionTx(org, id, { ...input, actor: String(caller.userId) }));
}
export function getComplaint(org: number, id: string, caller: CapaCaller) {
  return readCapa(org, caller, () => getComplaintTx(org, id));
}
export function listComplaints(org: number, filters: ListComplaintsFilters, caller: CapaCaller) {
  return readCapa(org, caller, () => listComplaintsTx(org, filters));
}
export function getMdrEvent(org: number, id: string, caller: CapaCaller) {
  return readCapa(org, caller, () => getMdrEventTx(org, id));
}
export function listMdrEvents(org: number, filters: ListMdrFilters, caller: CapaCaller) {
  return readCapa(org, caller, () => listMdrEventsTx(org, filters));
}
export function getCapaRecord(org: number, id: string, caller: CapaCaller) {
  return readCapa(org, caller, () => getCapaRecordTx(org, id));
}
export function listCapaRecords(org: number, filters: ListCapaFilters, caller: CapaCaller) {
  return readCapa(org, caller, () => listCapaRecordsTx(org, filters));
}
export function listVigilanceEvents(org: number, filters: ListVigilanceFilters, caller: CapaCaller) {
  return readCapa(org, caller, () => listVigilanceEventsTx(org, filters));
}
export function getTriageQueue(org: number, filters: TriageQueueFilters, caller: CapaCaller) {
  return readCapa(org, caller, () => getTriageQueueTx(org, filters));
}
