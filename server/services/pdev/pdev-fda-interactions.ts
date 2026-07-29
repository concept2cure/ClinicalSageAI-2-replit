/**
 * PDEV FDA Interaction Stream — unifies q_submissions + fda_communications.
 *
 * The platform stores FDA touchpoints in two real tables:
 *   - q_submissions (+ q_sub_meetings, q_sub_questions, q_sub_commitments,
 *     q_sub_timeline_entries) — structured Pre-Sub / Pre-IND / SIR / SRD
 *     / Agreement / Informational machinery.
 *   - fda_communications — raw correspondence (email, letter, phone,
 *     meeting) at the organization / project level.
 *
 * This service produces a chronological, single-stream view of all
 * FDA touchpoints for a program — no new audit machinery, no schema
 * changes. Each item points back to its source table so the UI can
 * deep-link to the appropriate workbench.
 *
 * @module server/services/pdev/pdev-fda-interactions
 */

import { and, eq, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import {
  qSubmissions,
  qSubMeetings,
  qSubQuestions,
  qSubCommitments,
  qSubTimelineEntries,
} from '../../../shared/schema/q-sub';
import { fdaCommunications } from '../../../shared/schema';
import { regulatoryPrograms } from '../../../shared/schema/programs';

export type PdevFdaInteractionKind =
  | 'q_submission'
  | 'q_sub_meeting'
  | 'q_sub_question'
  | 'q_sub_commitment'
  | 'q_sub_timeline'
  | 'fda_communication';

export interface PdevFdaInteractionItem {
  kind: PdevFdaInteractionKind;
  /** Source table primary key. */
  sourceId: string | number;
  /** Sort/display timestamp (ISO). */
  at: string;
  title: string;
  summary?: string;
  /** Bag of source-specific fields the UI can use. */
  meta: Record<string, unknown>;
}

export interface PdevFdaInteractionStream {
  programId: string;
  items: PdevFdaInteractionItem[];
  counts: {
    qSubmissions: number;
    qSubMeetings: number;
    qSubQuestions: number;
    qSubCommitments: number;
    qSubTimeline: number;
    fdaCommunications: number;
  };
}

const isoOrUndefined = (d: unknown): string | undefined => {
  if (d instanceof Date) return d.toISOString();
  if (typeof d === 'string' && d.length > 0) return d;
  return undefined;
};

export class PdevFdaInteractionsService {
  /**
   * Load all FDA touchpoints for a program. Tenant gated by joining
   * `regulatory_programs` first to confirm organization ownership.
   */
  async getStream(
    programId: string,
    organizationId: number
  ): Promise<PdevFdaInteractionStream | null> {
    const programRows = await db
      .select({
        id: regulatoryPrograms.id,
        organizationId: regulatoryPrograms.organizationId,
      })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, programId),
          eq(regulatoryPrograms.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!programRows[0]) return null;

    // q_submissions family — text program_id matches.
    const subs = await db
      .select()
      .from(qSubmissions)
      .where(eq(qSubmissions.programId, programId))
      .orderBy(desc(qSubmissions.filedAt));

    const subIds = subs.map(s => s.id);

    const meetings = subIds.length
      ? await db.select().from(qSubMeetings).where(inArray(qSubMeetings.qSubmissionId, subIds))
      : [];
    const questions = subIds.length
      ? await db.select().from(qSubQuestions).where(inArray(qSubQuestions.qSubmissionId, subIds))
      : [];
    const timeline = subIds.length
      ? await db
          .select()
          .from(qSubTimelineEntries)
          .where(inArray(qSubTimelineEntries.qSubmissionId, subIds))
      : [];

    const questionIds = questions.map(q => q.id);
    const commitments = questionIds.length
      ? await db
          .select()
          .from(qSubCommitments)
          .where(inArray(qSubCommitments.qSubQuestionId, questionIds))
      : [];

    // fda_communications — organization-scoped raw correspondence.
    const comms = await db
      .select()
      .from(fdaCommunications)
      .where(eq(fdaCommunications.organizationId, organizationId))
      .orderBy(desc(fdaCommunications.sentAt));

    const items: PdevFdaInteractionItem[] = [];

    for (const s of subs) {
      items.push({
        kind: 'q_submission',
        sourceId: s.id,
        at:
          isoOrUndefined(s.filedAt) ??
          isoOrUndefined(s.targetDate) ??
          new Date().toISOString(),
        title: s.title,
        summary: `${s.qSubType.toUpperCase()} — stage: ${s.stage}`,
        meta: {
          qNumber: s.qNumber,
          qSubType: s.qSubType,
          stage: s.stage,
          fdaTeam: s.fdaTeam,
        },
      });
    }

    for (const m of meetings) {
      items.push({
        kind: 'q_sub_meeting',
        sourceId: m.id,
        at: isoOrUndefined(m.meetingDate) ?? new Date().toISOString(),
        title: m.kind,
        summary: m.fdaTeamDisplay ?? undefined,
        meta: {
          qSubmissionId: m.qSubmissionId,
          confirmed: m.confirmed,
          minutesReceivedAt: isoOrUndefined(m.minutesReceivedAt),
          hasMinutes: Boolean(m.minutesText),
        },
      });
    }

    for (const q of questions) {
      items.push({
        kind: 'q_sub_question',
        sourceId: q.id,
        at: isoOrUndefined(q.createdAt) ?? new Date().toISOString(),
        title: q.question,
        summary: q.status,
        meta: {
          qSubmissionId: q.qSubmissionId,
          n: q.n,
          ourPosition: q.ourPosition,
          fdaResponse: q.fdaResponse,
        },
      });
    }

    for (const c of commitments) {
      items.push({
        kind: 'q_sub_commitment',
        sourceId: c.id,
        at: isoOrUndefined(c.createdAt) ?? new Date().toISOString(),
        title: c.displayCode,
        summary: c.text,
        meta: {
          qSubQuestionId: c.qSubQuestionId,
          dossierLinkKind: c.dossierLinkKind,
          dossierLinkLabel: c.dossierLinkLabel,
          dossierLinkSectionId: c.dossierLinkSectionId,
          rolledIn: c.rolledIn,
          blocker: c.blocker,
        },
      });
    }

    for (const t of timeline) {
      items.push({
        kind: 'q_sub_timeline',
        sourceId: t.id,
        at: isoOrUndefined(t.occurredAt) ?? new Date().toISOString(),
        title: t.what,
        summary: `${t.who} · ${t.when}`,
        meta: {
          qSubmissionId: t.qSubmissionId,
        },
      });
    }

    for (const c of comms) {
      items.push({
        kind: 'fda_communication',
        sourceId: c.id,
        at:
          isoOrUndefined(c.sentAt) ??
          isoOrUndefined(c.receivedAt) ??
          isoOrUndefined(c.createdAt) ??
          new Date().toISOString(),
        title: c.subject,
        summary: c.summary ?? `${c.direction} — ${c.communicationType}`,
        meta: {
          direction: c.direction,
          communicationType: c.communicationType,
          status: c.status,
          projectId: c.projectId,
        },
      });
    }

    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    return {
      programId,
      items,
      counts: {
        qSubmissions: subs.length,
        qSubMeetings: meetings.length,
        qSubQuestions: questions.length,
        qSubCommitments: commitments.length,
        qSubTimeline: timeline.length,
        fdaCommunications: comms.length,
      },
    };
  }
}

export const pdevFdaInteractionsService = new PdevFdaInteractionsService();
