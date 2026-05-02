/**
 * Q-Sub service — Pre-Submission, SIR, SRD, Agreement, Informational.
 *
 * All reads and writes are tenant-scoped: every operation joins
 * regulatoryPrograms.organization_id and refuses access if the program does
 * not belong to the caller's organization. The Q-Sub tables themselves carry
 * only program_id (no organization_id) — same pattern as evidence-sufficiency
 * and post-market.
 */

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../../db';
import auditService from '../auditService';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import {
  qSubmissions,
  qSubMeetings,
  qSubQuestions,
  qSubCommitments,
  qSubTimelineEntries,
  Q_SUB_TYPES,
  Q_SUB_STAGES,
  DOSSIER_LINK_KINDS,
} from '../../../shared/schema/q-sub';
import type { QSubmission, QSubCommitment } from '../../../shared/schema/q-sub';

// ─── Types exposed to the route layer ───────────────────────────────────────

export type Tone = '' | 'ok' | 'warn' | 'err';
export type QSubType = (typeof Q_SUB_TYPES)[number];
export type QSubStage = (typeof Q_SUB_STAGES)[number];
export type DossierLinkKind = (typeof DOSSIER_LINK_KINDS)[number];
export type QuestionStatus = 'answered' | 'awaiting';

export interface QSubMeetingDto {
  date: string;
  kind: string;
  team: string;
  confirmed: boolean;
}

export interface QSubListRow {
  id: string;
  qNumber: string;
  type: QSubType;
  prog: string;
  progTitle: string;
  title: string;
  stage: QSubStage;
  daysIn: number;
  filed: string | null;
  targetDate: string | null;
  meeting: QSubMeetingDto | null;
  questions: number;
  answered: number;
  commitments: number;
  rolledIn: number;
  fdaTeam: string;
  tone: Tone;
}

export interface QSubDossierLink {
  kind: DossierLinkKind;
  label: string;
  sectionId: string;
}

export interface QSubCommitmentDto {
  id: string;
  displayCode: string;
  text: string;
  dossierLink: QSubDossierLink;
  rolledIn: boolean;
  rolledInAt: string | null;
  rolledInBy: string | null;
  blocker: boolean;
}

export interface QSubQuestionDto {
  id: string;
  n: number;
  question: string;
  ourPosition: string;
  fdaResponse: string | null;
  status: QuestionStatus;
  commitments: QSubCommitmentDto[];
}

export interface QSubTimelineDto {
  when: string;
  who: string;
  what: string;
  occurredAt: string;
}

export interface QSubDetail {
  id: string;
  qNumber: string;
  type: QSubType;
  prog: string;
  progTitle: string;
  title: string;
  stage: QSubStage;
  daysIn: number;
  filed: string | null;
  targetDate: string | null;
  meeting: QSubMeetingDto | null;
  fdaTeam: string;
  tone: Tone;
  summary: string;
  // Aggregates (mirrors the list shape so a single fetch can hydrate both
  // surfaces without a second round-trip).
  answeredCount: number;
  questionCount: number;
  commitmentCount: number;
  rolledInCount: number;
  // Full nested resources.
  questions: QSubQuestionDto[];
  timeline: QSubTimelineDto[];
}

// ─── List ───────────────────────────────────────────────────────────────────

export interface ListFilters {
  type?: QSubType;
  stage?: QSubStage;
  programId?: string;
  limit?: number;
}

export async function listQSubsForOrg(
  organizationId: number,
  filters: ListFilters = {},
): Promise<QSubListRow[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);

  const conds = [eq(regulatoryPrograms.organizationId, organizationId)];
  if (filters.type) conds.push(eq(qSubmissions.qSubType, filters.type));
  if (filters.stage) conds.push(eq(qSubmissions.stage, filters.stage));
  if (filters.programId) conds.push(eq(qSubmissions.programId, filters.programId));

  const rows = await db
    .select({
      id: qSubmissions.id,
      qNumber: qSubmissions.qNumber,
      type: qSubmissions.qSubType,
      programCode: regulatoryPrograms.code,
      programName: regulatoryPrograms.name,
      title: qSubmissions.title,
      stage: qSubmissions.stage,
      daysIn: qSubmissions.daysIn,
      filedAt: qSubmissions.filedAt,
      targetDate: qSubmissions.targetDate,
      fdaTeam: qSubmissions.fdaTeam,
      tone: qSubmissions.tone,
    })
    .from(qSubmissions)
    .innerJoin(
      regulatoryPrograms,
      eq(regulatoryPrograms.id, sql`${qSubmissions.programId}::uuid`),
    )
    .where(and(...conds))
    .orderBy(desc(qSubmissions.updatedAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const submissionIds = rows.map(r => r.id);

  const [questionAgg, commitmentAgg, latestMeetings] = await Promise.all([
    db
      .select({
        qSubmissionId: qSubQuestions.qSubmissionId,
        total: sql<number>`count(*)::int`,
        answered: sql<number>`sum(case when ${qSubQuestions.status} = 'answered' then 1 else 0 end)::int`,
      })
      .from(qSubQuestions)
      .where(inArray(qSubQuestions.qSubmissionId, submissionIds))
      .groupBy(qSubQuestions.qSubmissionId),

    db
      .select({
        qSubmissionId: qSubQuestions.qSubmissionId,
        total: sql<number>`count(*)::int`,
        rolledIn: sql<number>`sum(case when ${qSubCommitments.rolledIn} then 1 else 0 end)::int`,
      })
      .from(qSubCommitments)
      .innerJoin(qSubQuestions, eq(qSubQuestions.id, qSubCommitments.qSubQuestionId))
      .where(inArray(qSubQuestions.qSubmissionId, submissionIds))
      .groupBy(qSubQuestions.qSubmissionId),

    db
      .select({
        qSubmissionId: qSubMeetings.qSubmissionId,
        meetingDate: qSubMeetings.meetingDate,
        kind: qSubMeetings.kind,
        fdaTeamDisplay: qSubMeetings.fdaTeamDisplay,
        confirmed: qSubMeetings.confirmed,
      })
      .from(qSubMeetings)
      .where(inArray(qSubMeetings.qSubmissionId, submissionIds))
      .orderBy(asc(qSubMeetings.meetingDate)),
  ]);

  const qByCount = new Map(questionAgg.map(q => [q.qSubmissionId, q]));
  const cByCount = new Map(commitmentAgg.map(c => [c.qSubmissionId, c]));
  const meetingByQ = new Map<string, (typeof latestMeetings)[number]>();
  for (const m of latestMeetings) {
    if (!meetingByQ.has(m.qSubmissionId)) meetingByQ.set(m.qSubmissionId, m);
  }

  return rows.map(r => {
    const q = qByCount.get(r.id);
    const c = cByCount.get(r.id);
    const m = meetingByQ.get(r.id);
    return {
      id: r.id,
      qNumber: r.qNumber ?? '—',
      type: r.type as QSubType,
      prog: r.programCode,
      progTitle: r.programName,
      title: r.title,
      stage: r.stage as QSubStage,
      daysIn: r.daysIn,
      filed: r.filedAt ? formatShortDate(r.filedAt) : null,
      targetDate: r.targetDate ? formatShortDate(r.targetDate) : null,
      meeting: m
        ? {
            date: formatShortDate(m.meetingDate),
            kind: m.kind,
            team: m.fdaTeamDisplay ?? '',
            confirmed: m.confirmed,
          }
        : null,
      questions: q?.total ?? 0,
      answered: q?.answered ?? 0,
      commitments: c?.total ?? 0,
      rolledIn: c?.rolledIn ?? 0,
      fdaTeam: r.fdaTeam ?? '',
      tone: (r.tone ?? '') as Tone,
    };
  });
}

// ─── Detail ─────────────────────────────────────────────────────────────────

export async function getQSubDetail(
  organizationId: number,
  qSubmissionId: string,
): Promise<QSubDetail | null> {
  const [head] = await db
    .select({
      id: qSubmissions.id,
      qNumber: qSubmissions.qNumber,
      type: qSubmissions.qSubType,
      programCode: regulatoryPrograms.code,
      programName: regulatoryPrograms.name,
      title: qSubmissions.title,
      stage: qSubmissions.stage,
      daysIn: qSubmissions.daysIn,
      filedAt: qSubmissions.filedAt,
      targetDate: qSubmissions.targetDate,
      fdaTeam: qSubmissions.fdaTeam,
      tone: qSubmissions.tone,
      summary: qSubmissions.summary,
    })
    .from(qSubmissions)
    .innerJoin(
      regulatoryPrograms,
      eq(regulatoryPrograms.id, sql`${qSubmissions.programId}::uuid`),
    )
    .where(
      and(
        eq(qSubmissions.id, qSubmissionId),
        eq(regulatoryPrograms.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!head) return null;

  const [questionRows, meetingRows, timelineRows] = await Promise.all([
    db
      .select()
      .from(qSubQuestions)
      .where(eq(qSubQuestions.qSubmissionId, qSubmissionId))
      .orderBy(asc(qSubQuestions.n)),
    db
      .select()
      .from(qSubMeetings)
      .where(eq(qSubMeetings.qSubmissionId, qSubmissionId))
      .orderBy(asc(qSubMeetings.meetingDate)),
    db
      .select()
      .from(qSubTimelineEntries)
      .where(eq(qSubTimelineEntries.qSubmissionId, qSubmissionId))
      .orderBy(desc(qSubTimelineEntries.occurredAt)),
  ]);

  const commitments: QSubCommitment[] = questionRows.length
    ? await db
        .select()
        .from(qSubCommitments)
        .where(
          inArray(
            qSubCommitments.qSubQuestionId,
            questionRows.map(q => q.id),
          ),
        )
    : [];

  const commitmentsByQuestion = new Map<string, QSubCommitment[]>();
  for (const c of commitments) {
    const list = commitmentsByQuestion.get(c.qSubQuestionId) ?? [];
    list.push(c);
    commitmentsByQuestion.set(c.qSubQuestionId, list);
  }

  const meeting = meetingRows[0] ?? null;
  return {
    id: head.id,
    qNumber: head.qNumber ?? '—',
    type: head.type as QSubType,
    prog: head.programCode,
    progTitle: head.programName,
    title: head.title,
    stage: head.stage as QSubStage,
    daysIn: head.daysIn,
    filed: head.filedAt ? formatShortDate(head.filedAt) : null,
    targetDate: head.targetDate ? formatShortDate(head.targetDate) : null,
    meeting: meeting
      ? {
          date: formatShortDate(meeting.meetingDate),
          kind: meeting.kind,
          team: meeting.fdaTeamDisplay ?? '',
          confirmed: meeting.confirmed,
        }
      : null,
    fdaTeam: head.fdaTeam ?? '',
    tone: (head.tone ?? '') as Tone,
    summary: head.summary ?? '',
    answeredCount: questionRows.filter(q => q.status === 'answered').length,
    questionCount: questionRows.length,
    commitmentCount: commitments.length,
    rolledInCount: commitments.filter(c => c.rolledIn).length,
    questions: questionRows.map(q => ({
      id: q.id,
      n: q.n,
      question: q.question,
      ourPosition: q.ourPosition,
      fdaResponse: q.fdaResponse,
      status: q.status as QuestionStatus,
      commitments: (commitmentsByQuestion.get(q.id) ?? []).map(c => ({
        id: c.id,
        displayCode: c.displayCode,
        text: c.text,
        dossierLink: {
          kind: c.dossierLinkKind as DossierLinkKind,
          label: c.dossierLinkLabel,
          sectionId: c.dossierLinkSectionId,
        },
        rolledIn: c.rolledIn,
        rolledInAt: c.rolledInAt ? c.rolledInAt.toISOString() : null,
        rolledInBy: c.rolledInBy,
        blocker: c.blocker,
      })),
    })),
    timeline: timelineRows.map(t => ({
      when: t.when,
      who: t.who,
      what: t.what,
      occurredAt: t.occurredAt.toISOString(),
    })),
  };
}

// ─── Create ─────────────────────────────────────────────────────────────────

export interface CreateQSubInput {
  programId: string;
  qSubType: QSubType;
  title: string;
  fdaTeam?: string | null;
  targetDate?: Date | null;
  summary?: string | null;
  createdBy?: string | null;
}

export async function createQSubmission(
  organizationId: number,
  input: CreateQSubInput,
): Promise<QSubmission> {
  // Tenant gate: program must belong to caller's org.
  const [program] = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(
      and(
        eq(regulatoryPrograms.id, input.programId),
        eq(regulatoryPrograms.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!program) {
    throw new TenantAccessError('Program does not belong to this organization');
  }

  const [row] = await db
    .insert(qSubmissions)
    .values({
      programId: input.programId,
      qSubType: input.qSubType,
      title: input.title,
      stage: 'plan',
      daysIn: 0,
      fdaTeam: input.fdaTeam ?? null,
      targetDate: input.targetDate ?? null,
      summary: input.summary ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  // Part 11 audit trail. Fire-and-forget; auditService never throws.
  void auditService.logAction({
    tenantId: organizationId,
    userId: input.createdBy ?? null,
    action: 'q_sub.create',
    resourceType: 'q_submission',
    resourceId: row.id,
    details: {
      programId: row.programId,
      qSubType: row.qSubType,
      title: row.title,
      stage: row.stage,
    },
  });

  return row;
}

// ─── Mark commitment as rolled-in ───────────────────────────────────────────

export interface SetRolledInInput {
  commitmentId: string;
  rolledIn: boolean;
  rolledInBy?: string | null;
}

export async function setCommitmentRolledIn(
  organizationId: number,
  input: SetRolledInInput,
): Promise<QSubCommitment> {
  // Tenant gate: walk commitment → question → submission → program → org.
  const [scoped] = await db
    .select({ id: qSubCommitments.id })
    .from(qSubCommitments)
    .innerJoin(qSubQuestions, eq(qSubQuestions.id, qSubCommitments.qSubQuestionId))
    .innerJoin(qSubmissions, eq(qSubmissions.id, qSubQuestions.qSubmissionId))
    .innerJoin(
      regulatoryPrograms,
      eq(regulatoryPrograms.id, sql`${qSubmissions.programId}::uuid`),
    )
    .where(
      and(
        eq(qSubCommitments.id, input.commitmentId),
        eq(regulatoryPrograms.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!scoped) {
    throw new TenantAccessError('Commitment does not belong to this organization');
  }

  const [updated] = await db
    .update(qSubCommitments)
    .set({
      rolledIn: input.rolledIn,
      rolledInAt: input.rolledIn ? new Date() : null,
      rolledInBy: input.rolledIn ? (input.rolledInBy ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(qSubCommitments.id, input.commitmentId))
    .returning();

  void auditService.logAction({
    tenantId: organizationId,
    userId: input.rolledInBy ?? null,
    action: input.rolledIn ? 'q_sub.commitment.rolled_in' : 'q_sub.commitment.rolled_out',
    resourceType: 'q_sub_commitment',
    resourceId: updated.id,
    details: {
      displayCode: updated.displayCode,
      dossierLinkSectionId: updated.dossierLinkSectionId,
      rolledIn: updated.rolledIn,
    },
  });

  return updated;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export class TenantAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantAccessError';
  }
}

const SHORT_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});

function formatShortDate(d: Date): string {
  return SHORT_FORMAT.format(d);
}
