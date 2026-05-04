/**
 * CAPA / complaint / MDR / vigilance service.
 *
 * All reads and writes are tenant-scoped: every operation joins
 * regulatoryPrograms.organization_id and refuses access if the program does
 * not belong to the caller's organization. Mirrors the q-sub / post-market
 * isolation pattern.
 *
 * Public surface:
 *   - createComplaint               — single intake, runs preliminary classification
 *   - getComplaint                  — full detail (with linked MDR + CAPA)
 *   - listComplaints                — filtered list for the triage queue
 *   - transitionComplaint           — state-machine-checked move + audit event
 *   - createMdrEvent                — open an MDR (with reportability clock)
 *   - listMdrEvents                 — filtered list (with aging fields)
 *   - getMdrEvent                   — full detail
 *   - transitionMdrEvent            — state-machine-checked move
 *   - markMdrFiled                  — convenience: filed + confirmation code
 *   - createCapaRecord              — open a CAPA (with optional source refs)
 *   - listCapaRecords               — filtered list
 *   - getCapaRecord                 — full detail (with actions)
 *   - transitionCapa                — state-machine-checked move
 *   - addCapaAction / completeAction — action-item ops
 *   - listVigilanceEvents           — append-only timeline scoped to a program
 *   - getTriageQueue                — unified queue across complaints/MDR/CAPA
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import auditService from '../auditService';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import {
  complaints,
  mdrEvents,
  capaRecords,
  capaActions,
  vigilanceEvents,
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

import { classify, type TriageInput } from './triageEngine';
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

// ─────────────────────────────────────────────────────────────────────────────
// Tenant guard — one DB roundtrip to confirm the program belongs to the org.
// ─────────────────────────────────────────────────────────────────────────────

async function assertProgramAccess(organizationId: number, programId: string): Promise<void> {
  const [row] = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(
      and(
        eq(regulatoryPrograms.id, sql`${programId}::uuid`),
        eq(regulatoryPrograms.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new TenantAccessError(`Program ${programId} not accessible by organization ${organizationId}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Code generation — display ids like CMP-2025-001 / MDR-2025-001 / CAPA-2025-001
// ─────────────────────────────────────────────────────────────────────────────

function yearPrefix(): string {
  return new Date().getUTCFullYear().toString();
}

async function nextCode(prefix: string, programId: string, table: 'complaint' | 'mdr' | 'capa'): Promise<string> {
  const year = yearPrefix();
  // Count existing rows for this program/year and increment. Race-prone in
  // theory; in practice the (programId, code) unique index will reject
  // duplicates and the caller can retry.
  let count = 0;
  if (table === 'complaint') {
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(complaints)
      .where(eq(complaints.programId, programId));
    count = c ?? 0;
  } else if (table === 'mdr') {
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(mdrEvents)
      .where(eq(mdrEvents.programId, programId));
    count = c ?? 0;
  } else {
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(capaRecords)
      .where(eq(capaRecords.programId, programId));
    count = c ?? 0;
  }
  const seq = String(count + 1).padStart(4, '0');
  return `${prefix}-${year}-${seq}`;
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

  const [row] = await db
    .insert(vigilanceEvents)
    .values({
      programId: opts.programId,
      kind: opts.kind,
      entityType: opts.entityType,
      entityId: opts.entityId,
      actor: opts.actor ?? null,
      actorRole: opts.actorRole ?? null,
      occurredAt,
      payload: opts.payload ?? null,
      reason: opts.reason ?? null,
    })
    .returning();

  // Mirror to the platform-wide audit_logs table.
  await auditService.logAction({
    tenantId: opts.organizationId,
    userId: opts.actor ?? undefined,
    action: opts.kind,
    resourceType: opts.entityType,
    resourceId: opts.entityId,
    details: { programId: opts.programId, payload: opts.payload, reason: opts.reason },
  });

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
  eventLocationCountry?: string | null;
  eventNarrative: string;
  patientHarm?: HarmLevel;
  severityAssessment?: SeverityLevel;
  isMalfunction?: boolean;
  anticipatesCorrection?: boolean;
  trendThresholdCrossed?: boolean;
  createdBy?: string | null;
}

export async function createComplaint(
  organizationId: number,
  input: CreateComplaintInput,
): Promise<Complaint> {
  await assertProgramAccess(organizationId, input.programId);

  const triageInput: TriageInput = {
    patientHarm: input.patientHarm ?? 'none',
    isMalfunction: input.isMalfunction ?? false,
    eventLocationCountry: input.eventLocationCountry ?? null,
    anticipatesCorrection: input.anticipatesCorrection ?? false,
    trendThresholdCrossed: input.trendThresholdCrossed ?? false,
    eventNarrative: input.eventNarrative,
  };
  const classification = classify(triageInput);

  const code = await nextCode('CMP', input.programId, 'complaint');

  const [row] = await db
    .insert(complaints)
    .values({
      programId: input.programId,
      complaintCode: code,
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
      patientHarm: input.patientHarm ?? 'none',
      severityAssessment: input.severityAssessment ?? 'minor',
      preliminaryClassification: classification,
      triageState: 'new',
      createdBy: input.createdBy ?? null,
      updatedBy: input.createdBy ?? null,
    })
    .returning();

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

export async function listComplaints(
  organizationId: number,
  filters: ListComplaintsFilters = {},
): Promise<Complaint[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const conds = [eq(regulatoryPrograms.organizationId, organizationId)];
  if (filters.programId) conds.push(eq(complaints.programId, filters.programId));
  if (filters.state) conds.push(eq(complaints.triageState, filters.state));
  if (filters.source) conds.push(eq(complaints.source, filters.source));
  if (filters.severity) conds.push(eq(complaints.severityAssessment, filters.severity));
  if (filters.openOnly) {
    conds.push(sql`${complaints.triageState} <> 'closed'`);
  }

  const rows = await db
    .select({ row: complaints })
    .from(complaints)
    .innerJoin(
      regulatoryPrograms,
      eq(regulatoryPrograms.id, sql`${complaints.programId}::uuid`),
    )
    .where(and(...conds))
    .orderBy(desc(complaints.receivedAt))
    .limit(limit);

  return rows.map(r => r.row);
}

export async function getComplaint(organizationId: number, id: string): Promise<Complaint | null> {
  const [row] = await db
    .select({ row: complaints })
    .from(complaints)
    .innerJoin(
      regulatoryPrograms,
      eq(regulatoryPrograms.id, sql`${complaints.programId}::uuid`),
    )
    .where(
      and(eq(complaints.id, id), eq(regulatoryPrograms.organizationId, organizationId)),
    )
    .limit(1);
  return row?.row ?? null;
}

export interface TransitionComplaintInput {
  to: ComplaintState;
  triageDecision?: Record<string, unknown> | null;
  closureReason?: string | null;
  reason?: string | null; // 21 CFR Part 11 reason-for-change
  actor?: string | null;
  actorRole?: string | null;
}

export async function transitionComplaint(
  organizationId: number,
  id: string,
  input: TransitionComplaintInput,
): Promise<Complaint> {
  const current = await getComplaint(organizationId, id);
  if (!current) throw new NotFoundError(`Complaint ${id} not found`);
  assertComplaintTransition(current.triageState as ComplaintState, input.to);

  const now = new Date();
  const update: Partial<Complaint> = {
    triageState: input.to,
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

  const [row] = await db
    .update(complaints)
    .set(update)
    .where(eq(complaints.id, id))
    .returning();

  await recordVigilance({
    organizationId,
    programId: current.programId,
    kind: input.to === 'triaged' ? 'complaint_triaged' : 'complaint_state_changed',
    entityType: 'complaint',
    entityId: id,
    actor: input.actor ?? null,
    actorRole: input.actorRole ?? null,
    occurredAt: now,
    payload: { from: current.triageState, to: input.to, triageDecision: input.triageDecision ?? null },
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

export async function createMdrEvent(
  organizationId: number,
  input: CreateMdrEventInput,
): Promise<MdrEvent> {
  await assertProgramAccess(organizationId, input.programId);

  const clock = computeReportDue({
    jurisdiction: input.jurisdiction,
    decisionDate: input.decisionDate,
    usFdaReportType: input.usFdaReportType ?? null,
    euMdrSeverity: input.euMdrSeverity ?? null,
  });

  const code = await nextCode('MDR', input.programId, 'mdr');
  const days = daysToDue(clock.reportDueAt);

  const [row] = await db
    .insert(mdrEvents)
    .values({
      programId: input.programId,
      mdrCode: code,
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
    .returning();

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
    await db
      .update(complaints)
      .set({ linkedMdrEventId: row.id })
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

export async function listMdrEvents(
  organizationId: number,
  filters: ListMdrFilters = {},
): Promise<MdrEvent[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const conds = [eq(regulatoryPrograms.organizationId, organizationId)];
  if (filters.programId) conds.push(eq(mdrEvents.programId, filters.programId));
  if (filters.state) conds.push(eq(mdrEvents.state, filters.state));
  if (filters.jurisdiction) conds.push(eq(mdrEvents.jurisdiction, filters.jurisdiction));
  if (filters.overdueOnly) {
    conds.push(sql`${mdrEvents.reportDueAt} < now() AND ${mdrEvents.state} NOT IN ('filed','acknowledged','closed')`);
  }

  const rows = await db
    .select({ row: mdrEvents })
    .from(mdrEvents)
    .innerJoin(
      regulatoryPrograms,
      eq(regulatoryPrograms.id, sql`${mdrEvents.programId}::uuid`),
    )
    .where(and(...conds))
    .orderBy(asc(mdrEvents.reportDueAt))
    .limit(limit);

  // Refresh daysToDue at read time (denormalized field can drift).
  return rows.map(r => ({ ...r.row, daysToDue: daysToDue(r.row.reportDueAt) }));
}

export async function getMdrEvent(organizationId: number, id: string): Promise<MdrEvent | null> {
  const [row] = await db
    .select({ row: mdrEvents })
    .from(mdrEvents)
    .innerJoin(
      regulatoryPrograms,
      eq(regulatoryPrograms.id, sql`${mdrEvents.programId}::uuid`),
    )
    .where(
      and(eq(mdrEvents.id, id), eq(regulatoryPrograms.organizationId, organizationId)),
    )
    .limit(1);
  if (!row) return null;
  return { ...row.row, daysToDue: daysToDue(row.row.reportDueAt) };
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

export async function transitionMdrEvent(
  organizationId: number,
  id: string,
  input: TransitionMdrInput,
): Promise<MdrEvent> {
  const current = await getMdrEvent(organizationId, id);
  if (!current) throw new NotFoundError(`MDR event ${id} not found`);
  assertMdrTransition(current.state as MdrState, input.to);

  const now = new Date();
  const update: Partial<MdrEvent> = {
    state: input.to,
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

  const [row] = await db
    .update(mdrEvents)
    .set(update)
    .where(eq(mdrEvents.id, id))
    .returning();

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

export async function createCapaRecord(
  organizationId: number,
  input: CreateCapaInput,
): Promise<CapaRecord> {
  await assertProgramAccess(organizationId, input.programId);
  const code = await nextCode('CAPA', input.programId, 'capa');

  const [row] = await db
    .insert(capaRecords)
    .values({
      programId: input.programId,
      capaCode: code,
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
    .returning();

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

export async function listCapaRecords(
  organizationId: number,
  filters: ListCapaFilters = {},
): Promise<CapaRecord[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const conds = [eq(regulatoryPrograms.organizationId, organizationId)];
  if (filters.programId) conds.push(eq(capaRecords.programId, filters.programId));
  if (filters.state) conds.push(eq(capaRecords.state, filters.state));
  if (filters.source) conds.push(eq(capaRecords.source, filters.source));
  if (filters.riskLevel) conds.push(eq(capaRecords.riskLevel, filters.riskLevel));
  if (filters.openOnly) {
    conds.push(sql`${capaRecords.state} NOT IN ('closed_effective','closed_not_effective')`);
  }

  const rows = await db
    .select({ row: capaRecords })
    .from(capaRecords)
    .innerJoin(
      regulatoryPrograms,
      eq(regulatoryPrograms.id, sql`${capaRecords.programId}::uuid`),
    )
    .where(and(...conds))
    .orderBy(desc(capaRecords.updatedAt))
    .limit(limit);

  return rows.map(r => r.row);
}

export interface CapaDetail extends CapaRecord {
  actions: CapaAction[];
}

export async function getCapaRecord(
  organizationId: number,
  id: string,
): Promise<CapaDetail | null> {
  const [row] = await db
    .select({ row: capaRecords })
    .from(capaRecords)
    .innerJoin(
      regulatoryPrograms,
      eq(regulatoryPrograms.id, sql`${capaRecords.programId}::uuid`),
    )
    .where(
      and(eq(capaRecords.id, id), eq(regulatoryPrograms.organizationId, organizationId)),
    )
    .limit(1);
  if (!row) return null;

  const actions = await db
    .select()
    .from(capaActions)
    .where(eq(capaActions.capaId, id))
    .orderBy(asc(capaActions.n));

  return { ...row.row, actions };
}

export interface TransitionCapaInput {
  to: CapaState;
  reason?: string | null;
  actor?: string | null;
  actorRole?: string | null;
  effectivenessCheckResult?: Record<string, unknown> | null;
}

export async function transitionCapa(
  organizationId: number,
  id: string,
  input: TransitionCapaInput,
): Promise<CapaRecord> {
  const current = await getCapaRecord(organizationId, id);
  if (!current) throw new NotFoundError(`CAPA ${id} not found`);
  assertCapaTransition(current.state as CapaState, input.to);

  const now = new Date();
  const update: Partial<CapaRecord> = {
    state: input.to,
    updatedBy: input.actor ?? null,
  };
  if (input.to === 'closed_effective' || input.to === 'closed_not_effective') {
    update.closedAt = now;
    update.closedBy = input.actor ?? null;
    if (input.effectivenessCheckResult !== undefined) {
      update.effectivenessCheckResult = input.effectivenessCheckResult ?? null;
    }
  }

  const [row] = await db
    .update(capaRecords)
    .set(update)
    .where(eq(capaRecords.id, id))
    .returning();

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
    payload: { from: current.state, to: input.to, effectiveness: input.effectivenessCheckResult ?? null },
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

export async function addCapaAction(
  organizationId: number,
  input: AddCapaActionInput,
): Promise<CapaAction> {
  // Verify the parent CAPA belongs to the org.
  const parent = await getCapaRecord(organizationId, input.capaId);
  if (!parent) throw new NotFoundError(`CAPA ${input.capaId} not found`);

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${capaActions.n}), 0) + 1` })
    .from(capaActions)
    .where(eq(capaActions.capaId, input.capaId));

  const [row] = await db
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

export async function transitionCapaAction(
  organizationId: number,
  actionId: string,
  input: UpdateCapaActionInput,
): Promise<CapaAction> {
  // Tenant guard via a join.
  const rows = await db
    .select({ action: capaActions, programId: capaRecords.programId })
    .from(capaActions)
    .innerJoin(capaRecords, eq(capaRecords.id, capaActions.capaId))
    .innerJoin(
      regulatoryPrograms,
      eq(regulatoryPrograms.id, sql`${capaRecords.programId}::uuid`),
    )
    .where(
      and(
        eq(capaActions.id, actionId),
        eq(regulatoryPrograms.organizationId, organizationId),
      ),
    )
    .limit(1);
  const ctx = rows[0];
  if (!ctx) throw new NotFoundError(`Action ${actionId} not found`);

  assertActionTransition(ctx.action.state as ActionState, input.to);

  const now = new Date();
  const update: Partial<CapaAction> = {
    state: input.to,
  };
  if (input.to === 'done') {
    update.completedAt = now;
    update.completedBy = input.actor ?? null;
    if (input.evidenceRefs !== undefined) update.evidenceRefs = input.evidenceRefs as unknown;
  }

  const [row] = await db
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
    payload: { from: ctx.action.state, to: input.to, evidenceRefs: input.evidenceRefs ?? null },
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

export async function listVigilanceEvents(
  organizationId: number,
  filters: ListVigilanceFilters,
): Promise<VigilanceEvent[]> {
  await assertProgramAccess(organizationId, filters.programId);
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const conds = [eq(vigilanceEvents.programId, filters.programId)];
  if (filters.entityType) conds.push(eq(vigilanceEvents.entityType, filters.entityType));
  if (filters.entityId) conds.push(eq(vigilanceEvents.entityId, filters.entityId));
  if (filters.kind) conds.push(eq(vigilanceEvents.kind, filters.kind));
  return db
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

export async function getTriageQueue(
  organizationId: number,
  filters: TriageQueueFilters = {},
): Promise<TriageQueueItem[]> {
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const now = Date.now();

  const [openComplaints, openMdrs, openCapas] = await Promise.all([
    listComplaints(organizationId, {
      programId: filters.programId,
      openOnly: filters.openOnly ?? true,
      limit,
    }),
    listMdrEvents(organizationId, {
      programId: filters.programId,
      limit,
    }),
    listCapaRecords(organizationId, {
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
      overdue: due !== null && due < now && m.state !== 'filed' && m.state !== 'acknowledged' && m.state !== 'closed',
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
