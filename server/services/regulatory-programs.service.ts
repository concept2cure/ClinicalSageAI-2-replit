/**
 * Regulatory Programs business logic.
 *
 * The route file (server/routes/regulatory-programs.ts) is HTTP-only:
 * it resolves auth/tenant context, reads query params, calls these
 * service functions, and wraps the result with the canonical envelope
 * helpers (server/lib/api-response.ts).
 *
 * Every authorization-sensitive function takes orgId as the first
 * argument and either:
 *   - returns null when the requested resource isn't visible in the
 *     org (route → 404), or
 *   - returns a typed result.
 *
 * No HTTP types (Request / Response) are referenced here. These
 * functions are unit-testable against an in-process db / pool.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { users, auditLogs, cerv2510kSections, deviceTestStandards } from '../../shared/schema';
import { qSubmissions, qSubMeetings, qSubQuestions, qSubCommitments } from '../../shared/schema/q-sub';
import {
  SIGNAL_SOURCE_MAP,
  ACTION_TO_SEVERITY,
  STATUS_TO_KIT,
  ACTION_TO_VERB,
  type SignalSource,
  type SignalSeverity,
  type SignalKitStatus,
  type AuditVerb,
} from '../../shared/constants/mdx';

/* ─── Types exposed to the route layer ───────────────────────────── */

export interface ProgramRowWithLead {
  id: string;
  name: string;
  code: string;
  description: string | null;
  programType: string;
  productType: string;
  deviceClass: string | null;
  regulatoryPath: string | null;
  primaryAgency: string;
  productName: string;
  status: string;
  phase: string | null;
  priority: string | null;
  targetSubmissionDate: string | null;
  progressPercent: number | null;
  completedMilestones: number | null;
  totalMilestones: number | null;
  leadUserId: number | null;
  leadUserName: string | null;
  teamMembers: Array<{ name?: string; userId?: number; role?: string }> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  when: string;
  who: string;
  what: string;
  action: string;
  changedFields: string[];
}

export interface Milestone {
  id: string;
  label: string;
  date: string;
  state: 'complete' | 'active' | 'idle';
}

export interface RimRec {
  id: string;
  body: string;
  kind: 'mapping' | 'cross-ref' | 'consistency' | 'standards';
  impact: 'low' | 'med' | 'high';
}

export interface ChangeImpact {
  id: string;
  who: string;
  when: string;
  what: string;
  affects: string[];
}

export interface SafetySignalRow {
  id: string;
  source: SignalSource;
  event: string;
  count: number;
  severity: SignalSeverity;
  status: SignalKitStatus;
  detectedAt: string;
}

export interface LiteratureBucket {
  year: number;
  hits: number;
}

export interface LiteratureResult {
  buckets: LiteratureBucket[];
  total: number;
  productName: string;
}

export interface PmaModule {
  id: 'preclinical' | 'clinical' | 'manufacturing' | 'labeling' | 'statistical' | 'financial';
  label: string;
  desc: string;
  docs: number;
  status: 'complete' | 'active' | 'review' | 'draft';
}

export interface TrialMetric {
  label: string;
  metric: string;
  unit?: string;
  bar?: { pct: number; tone: 'ok' | 'warn' | 'err' };
  meta: string;
  tone?: 'ok' | 'warn' | 'err';
}

export interface PmaTrialMetricsResult {
  metrics: TrialMetric[];
  study: { id: string; name: string; phase: string; status: string } | null;
}

export interface PortfolioInsight {
  kind: string;
  body: string;
}

/* ─── Internal types (raw pg rows) ───────────────────────────────── */

interface PgError extends Error {
  code?: string;
}

function isPgUndefinedTable(err: unknown): boolean {
  return err instanceof Error && (err as PgError).code === '42P01';
}

interface SafetySignalDbRow {
  id: string | number;
  signal_source: string;
  description: string | null;
  detected_at: Date | string;
  evaluation_status: string;
  action: string;
}

interface SafetySignalCountRow {
  signal_source: string;
  n: number;
}

interface ClinicalOpsStudyRow {
  id: string;
  name: string;
  protocol: string;
  phase: string;
  status: string;
  indication: string;
  target_enrollment: number | null;
  enrolled: number | null;
  sites: number | null;
  active_sites: number | null;
  therapeutic_area: string | null;
  start_date: Date | string | null;
  estimated_end_date: Date | string | null;
  org_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

/* ─── Authorization helper ──────────────────────────────────────── */

/**
 * Verify a program with the given id belongs to the caller's org.
 * Returns the row when found, null when not. Used by every per-program
 * service function so each one fails-closed against cross-tenant access.
 */
export async function requireProgramInOrg(
  orgId: number,
  id: string,
): Promise<typeof regulatoryPrograms.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(regulatoryPrograms)
    .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

/* ─── Programs (list + get) ─────────────────────────────────────── */

/** List the regulatory programs visible to the caller's org, with lead
 *  user names resolved in a single batch (no N+1). Optionally filtered
 *  by `programType`. */
export async function listPrograms(
  orgId: number,
  filters: { programType?: string } = {},
): Promise<ProgramRowWithLead[]> {
  const conditions = [eq(regulatoryPrograms.organizationId, orgId)];
  if (filters.programType) conditions.push(eq(regulatoryPrograms.programType, filters.programType));

  const rows = await db
    .select()
    .from(regulatoryPrograms)
    .where(and(...conditions))
    .orderBy(desc(regulatoryPrograms.updatedAt));

  const leadIds = Array.from(
    new Set(rows.map((r) => r.leadUserId).filter((v): v is number => typeof v === 'number')),
  );
  const leadRows = leadIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, leadIds))
    : [];
  const leadById = new Map(leadRows.map((r) => [r.id, r.name]));

  return rows.map((r) => toProgramRow(r, leadById.get(r.leadUserId ?? -1) ?? null));
}

/** Get a single program by id, scoped to the caller's org. Returns null
 *  when the program doesn't exist or belongs to a different tenant. */
export async function getProgramById(
  orgId: number,
  id: string,
): Promise<ProgramRowWithLead | null> {
  const row = await requireProgramInOrg(orgId, id);
  if (!row) return null;

  let leadUserName: string | null = null;
  if (row.leadUserId != null) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.leadUserId));
    if (u) leadUserName = u.name;
  }
  return toProgramRow(row, leadUserName);
}

function toProgramRow(
  r: typeof regulatoryPrograms.$inferSelect,
  leadUserName: string | null,
): ProgramRowWithLead {
  return {
    id:                   r.id,
    name:                 r.name,
    code:                 r.code,
    description:          r.description ?? null,
    programType:          r.programType,
    productType:          r.productType,
    deviceClass:          r.deviceClass ?? null,
    regulatoryPath:       r.regulatoryPath ?? null,
    primaryAgency:        r.primaryAgency,
    productName:          r.productName,
    status:               r.status,
    phase:                r.phase ?? null,
    priority:             r.priority ?? null,
    targetSubmissionDate: r.targetSubmissionDate ? r.targetSubmissionDate.toISOString() : null,
    progressPercent:      r.progressPercent ?? 0,
    completedMilestones:  r.completedMilestones ?? 0,
    totalMilestones:      r.totalMilestones ?? 0,
    leadUserId:           r.leadUserId ?? null,
    leadUserName,
    teamMembers:          (r.teamMembers as ProgramRowWithLead['teamMembers']) ?? null,
    metadata:             (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt:            r.createdAt.toISOString(),
    updatedAt:            r.updatedAt.toISOString(),
  };
}

/* ─── Activity feed ───────────────────────────────────────────── */

/** Read audit_logs filtered to a specific program id. The caller must
 *  hold tenant access to the program (verified via requireProgramInOrg).
 *  Returns null when the program isn't visible to the org. */
export async function getActivity(
  orgId: number,
  programId: string,
  limit: number,
): Promise<ActivityEvent[] | null> {
  const program = await requireProgramInOrg(orgId, programId);
  if (!program) return null;

  /* Two flavors of resourceType ('regulatory_program' singular and
     'regulatory_programs' plural) are accepted — different writers in
     the codebase use different conventions; both are real. */
  const events = await db
    .select({
      id:         auditLogs.id,
      action:     auditLogs.action,
      tableName:  auditLogs.tableName,
      recordId:   auditLogs.recordId,
      userId:     auditLogs.userId,
      oldValues:  auditLogs.oldValues,
      newValues:  auditLogs.newValues,
      createdAt:  auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.tenantId, orgId),
        eq(auditLogs.recordId, programId),
        inArray(auditLogs.tableName, ['regulatory_program', 'regulatory_programs']),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  const userIds = Array.from(new Set(events.map((e) => e.userId).filter((v): v is number => typeof v === 'number')));
  const userRows = userIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
    : [];
  const userById = new Map(userRows.map((u) => [u.id, u.name]));

  return events.map((e) => {
    const oldVals = (e.oldValues as Record<string, unknown> | null) ?? null;
    const newVals = (e.newValues as Record<string, unknown> | null) ?? null;
    const changedFields: string[] = [];
    if (oldVals && newVals) {
      for (const k of Object.keys(newVals)) if (oldVals[k] !== newVals[k]) changedFields.push(k);
    } else if (newVals) {
      changedFields.push(...Object.keys(newVals));
    }
    const action = (e.action ?? 'updated').toLowerCase();
    const verb: AuditVerb = ACTION_TO_VERB[action] ?? 'updated';
    const what = changedFields.length === 0
      ? `${verb} program`
      : `${verb} ${changedFields.slice(0, 3).join(', ')}${changedFields.length > 3 ? ' …' : ''}`;
    return {
      id:        e.id,
      when:      e.createdAt.toISOString(),
      who:       e.userId != null ? (userById.get(e.userId) ?? 'System') : 'System',
      what,
      action:    e.action,
      changedFields,
    };
  });
}

/* ─── Milestones ──────────────────────────────────────────────── */

/** Derive an 8-step milestone timeline from real state — Q-Sub
 *  meetings, eSTAR section completion, and program status/phase. */
export async function getMilestones(
  orgId: number,
  programId: string,
): Promise<Milestone[] | null> {
  const program = await requireProgramInOrg(orgId, programId);
  if (!program) return null;

  const milestones: Milestone[] = [];
  const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : 'TBD');

  const meetings = await db
    .select({ id: qSubMeetings.id, meetingDate: qSubMeetings.meetingDate, confirmed: qSubMeetings.confirmed, minutesReceivedAt: qSubMeetings.minutesReceivedAt })
    .from(qSubMeetings)
    .leftJoin(qSubmissions, eq(qSubMeetings.qSubmissionId, qSubmissions.id))
    .where(eq(qSubmissions.programId, programId))
    .orderBy(qSubMeetings.meetingDate);
  if (meetings[0]) {
    const m = meetings[0];
    milestones.push({
      id:    `m-qsub-${m.id}`,
      label: 'Q-Sub meeting',
      date:  fmtDate(m.meetingDate),
      state: m.minutesReceivedAt ? 'complete' : m.confirmed ? 'active' : 'idle',
    });
  }

  const [sectionAgg] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      done:  sql<number>`SUM(CASE WHEN ${cerv2510kSections.status} IN ('validated','approved') THEN 1 ELSE 0 END)::int`,
    })
    .from(cerv2510kSections)
    .where(eq(cerv2510kSections.organizationId, orgId));
  const total = sectionAgg?.total ?? 0;
  const done = sectionAgg?.done ?? 0;
  const completionPct = total === 0 ? 0 : Math.round((done / total) * 100);

  milestones.push({
    id:    'm-estar',
    label: 'eSTAR drafted',
    date:  completionPct >= 75 ? 'Complete' : completionPct >= 25 ? 'In progress' : 'Pending',
    state: completionPct >= 75 ? 'complete' : completionPct >= 25 ? 'active' : 'idle',
  });
  milestones.push({
    id:    'm-internal-qc',
    label: 'Internal QC',
    date:  completionPct >= 90 ? 'Complete' : completionPct >= 75 ? 'In progress' : 'Pending',
    state: completionPct >= 90 ? 'complete' : completionPct >= 75 ? 'active' : 'idle',
  });

  const status = (program.status ?? '').toLowerCase();
  const phase  = (program.phase  ?? '').toLowerCase();
  const filingDone = status === 'submitted' || status === 'approved' || phase === 'submission' || phase === 'post_market';
  milestones.push({
    id:    'm-filing',
    label: 'FDA filing',
    date:  fmtDate(program.targetSubmissionDate),
    state: filingDone ? 'complete' : completionPct >= 90 ? 'active' : 'idle',
  });
  milestones.push({
    id:    'm-ack',
    label: 'AI acknowledgement',
    date:  filingDone ? 'Received' : 'Pending',
    state: filingDone ? 'complete' : 'idle',
  });
  milestones.push({
    id:    'm-substantive',
    label: 'Substantive review',
    date:  status === 'approved' ? 'Complete' : phase === 'post_market' ? 'Complete' : 'Pending',
    state: status === 'approved' || phase === 'post_market' ? 'complete' : filingDone ? 'active' : 'idle',
  });
  milestones.push({
    id:    'm-decision',
    label: 'Decision',
    date:  status === 'approved' ? 'Cleared' : 'Pending',
    state: status === 'approved' ? 'complete' : 'idle',
  });

  return milestones;
}

/* ─── RIM recommendations ────────────────────────────────────── */

/** Derive structural recommendations from dossier state — required-but-empty
 *  sections, open Q-Sub commitments, withdrawn standard refs, in_review
 *  sections at <100%. Pure derivation — no recommendations table. */
export async function getRimRecommendations(
  orgId: number,
  programId: string,
): Promise<RimRec[] | null> {
  const program = await requireProgramInOrg(orgId, programId);
  if (!program) return null;

  const recs: RimRec[] = [];

  /* Required-but-empty sections. */
  const gaps = await db
    .select({
      id:            cerv2510kSections.id,
      sectionNumber: cerv2510kSections.sectionNumber,
      sectionTitle:  cerv2510kSections.sectionTitle,
      completion:    cerv2510kSections.completionPercentage,
    })
    .from(cerv2510kSections)
    .where(
      and(
        eq(cerv2510kSections.organizationId, orgId),
        eq(cerv2510kSections.isRequired, true),
        eq(cerv2510kSections.status, 'todo'),
      ),
    )
    .limit(10);
  if (gaps.length > 0) {
    const titles = gaps.slice(0, 3).map((g) => `§${g.sectionNumber}`).join(', ');
    recs.push({
      id:     'rec-mapping',
      body:   `${gaps.length} required eSTAR section${gaps.length === 1 ? '' : 's'} still empty — ${titles}${gaps.length > 3 ? ' …' : ''}. Close gaps before pre-flight validation.`,
      kind:   'mapping',
      impact: gaps.length >= 3 ? 'high' : 'med',
    });
  }

  /* Open Q-Sub commitments not yet rolled into the dossier. */
  const openCommits = await db
    .select({
      id:       qSubCommitments.id,
      text:     qSubCommitments.text,
      rolledIn: qSubCommitments.rolledIn,
    })
    .from(qSubCommitments)
    .leftJoin(qSubQuestions, eq(qSubCommitments.qSubQuestionId, qSubQuestions.id))
    .leftJoin(qSubmissions,  eq(qSubQuestions.qSubmissionId, qSubmissions.id))
    .where(and(eq(qSubmissions.programId, programId), eq(qSubCommitments.rolledIn, false)))
    .limit(10);
  if (openCommits.length > 0) {
    recs.push({
      id:     'rec-crossref',
      body:   `${openCommits.length} Q-Sub commitment${openCommits.length === 1 ? '' : 's'} not yet rolled into the dossier. Propagate before filing.`,
      kind:   'cross-ref',
      impact: 'high',
    });
  }

  /* Withdrawn standard references (best-effort: scans cerv2_510k_sections.content
     for ISO/IEC/ASTM codes that match a withdrawn row). */
  const withdrawn = await db
    .select({ code: deviceTestStandards.standardCode })
    .from(deviceTestStandards)
    .where(eq(deviceTestStandards.status, 'withdrawn'))
    .limit(20);
  if (withdrawn.length > 0) {
    const codes = withdrawn.map((w) => w.code).filter(Boolean);
    if (codes.length > 0) {
      const sampleCodes = codes.slice(0, 5);
      const referenced = await db
        .select({ id: cerv2510kSections.id, sectionNumber: cerv2510kSections.sectionNumber })
        .from(cerv2510kSections)
        .where(
          and(
            eq(cerv2510kSections.organizationId, orgId),
            sql`${cerv2510kSections.content} ~* ${sampleCodes.join('|')}`,
          ),
        )
        .limit(5);
      if (referenced.length > 0) {
        const sections = referenced.map((r) => `§${r.sectionNumber}`).join(', ');
        recs.push({
          id:     'rec-standards',
          body:   `Withdrawn standard reference detected in ${sections}. Update to the latest revision.`,
          kind:   'standards',
          impact: 'med',
        });
      }
    }
  }

  /* Consistency check: in_review sections with completion <100. */
  const reviewIncomplete = await db
    .select({ id: cerv2510kSections.id, completion: cerv2510kSections.completionPercentage })
    .from(cerv2510kSections)
    .where(
      and(
        eq(cerv2510kSections.organizationId, orgId),
        eq(cerv2510kSections.status, 'in_review'),
        sql`${cerv2510kSections.completionPercentage} < 100`,
      ),
    )
    .limit(5);
  if (reviewIncomplete.length > 0) {
    recs.push({
      id:     'rec-consistency',
      body:   `${reviewIncomplete.length} section${reviewIncomplete.length === 1 ? '' : 's'} in review but flagged <100% complete. Reconcile before sign-off.`,
      kind:   'consistency',
      impact: 'med',
    });
  }

  return recs;
}

/* ─── Change impact ──────────────────────────────────────────── */

/** Recent section edits + cross-section impact. Reads audit_logs for
 *  cerv2_510k_sections updates, then scans peer-section content for
 *  cross-references to compute the affects[] list. */
export async function getChangeImpact(
  orgId: number,
  programId: string,
): Promise<ChangeImpact[] | null> {
  const program = await requireProgramInOrg(orgId, programId);
  if (!program) return null;

  const recentEdits = await db
    .select({
      id:        auditLogs.id,
      userId:    auditLogs.userId,
      recordId:  auditLogs.recordId,
      newValues: auditLogs.newValues,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.tenantId, orgId),
        inArray(auditLogs.tableName, ['cerv2_510k_sections', 'cerv2_section', 'sections']),
        inArray(auditLogs.action, ['update', 'updated', 'edit']),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(20);

  const userIds = Array.from(new Set(recentEdits.map((e) => e.userId).filter((v): v is number => typeof v === 'number')));
  const userRows = userIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
    : [];
  const userById = new Map(userRows.map((u) => [u.id, u.name]));

  const allSections = await db
    .select({
      id:            cerv2510kSections.id,
      sectionNumber: cerv2510kSections.sectionNumber,
      sectionTitle:  cerv2510kSections.sectionTitle,
      content:       cerv2510kSections.content,
    })
    .from(cerv2510kSections)
    .where(eq(cerv2510kSections.organizationId, orgId));
  const byId = new Map(allSections.map((s) => [String(s.id), s]));

  return recentEdits.slice(0, 6).map((edit) => {
    const sec = byId.get(String(edit.recordId));
    const editedNum = sec?.sectionNumber;
    const editedTitle = sec?.sectionTitle ?? `§${editedNum ?? '?'}`;
    const affects: string[] = [];
    if (editedNum != null) {
      const re = new RegExp(`§\\s*${editedNum}\\b|Section\\s+${editedNum}\\b`, 'i');
      for (const s of allSections) {
        if (s.id === sec?.id) continue;
        if (re.test(s.content ?? '')) {
          affects.push(s.sectionTitle ?? `§${s.sectionNumber}`);
          if (affects.length >= 4) break;
        }
      }
    }
    return {
      id:    edit.id,
      who:   edit.userId != null ? (userById.get(edit.userId) ?? 'System') : 'System',
      when:  edit.createdAt.toISOString(),
      what:  `edited ${editedTitle}`,
      affects,
    };
  });
}

/* ─── CER safety signals ─────────────────────────────────────── */

/** Per-program safety signals from safety_signals (org-text-coerced for
 *  schema mismatch with mainline integer org ids). Tolerates missing
 *  table by returning empty list. */
export async function getSafetySignals(
  orgId: number,
  programId: string,
): Promise<SafetySignalRow[] | null> {
  const program = await requireProgramInOrg(orgId, programId);
  if (!program) return null;

  let rows: SafetySignalDbRow[] = [];
  try {
    const result = await pool.query<SafetySignalDbRow>(
      `SELECT id, signal_source, description, detected_at, evaluation_status, action
         FROM safety_signals
        WHERE organization_id::text = $1::text
          AND ( project_id::text = $2::text OR project_id IS NULL )
        ORDER BY detected_at DESC
        LIMIT 50`,
      [String(orgId), programId],
    );
    rows = result.rows;
  } catch (err: unknown) {
    if (!isPgUndefinedTable(err)) throw err;
  }

  let countsBySource: Record<string, number> = {};
  try {
    const aeCounts = await pool.query<SafetySignalCountRow>(
      `SELECT signal_source, COUNT(*)::int AS n
         FROM safety_signals
        WHERE organization_id::text = $1::text
        GROUP BY signal_source`,
      [String(orgId)],
    );
    countsBySource = Object.fromEntries(aeCounts.rows.map((r) => [r.signal_source, r.n]));
  } catch {
    /* fall through */
  }

  return rows.map((r) => ({
    id:         String(r.id),
    source:     (SIGNAL_SOURCE_MAP[r.signal_source] ?? 'Spontaneous') as SignalSource,
    event:      String(r.description ?? '').slice(0, 160),
    count:      countsBySource[r.signal_source] ?? 1,
    severity:   (ACTION_TO_SEVERITY[r.action] ?? 'low') as SignalSeverity,
    status:     (STATUS_TO_KIT[r.evaluation_status] ?? 'review') as SignalKitStatus,
    detectedAt: r.detected_at instanceof Date ? r.detected_at.toISOString() : String(r.detected_at),
  }));
}

/* ─── CER literature corpus ──────────────────────────────────── */

/** Year-bucketed literature counts for the CER literature chart.
 *  6-year window ending current year. Tolerates missing
 *  literature_entries table by returning zero buckets. */
export async function getLiterature(
  orgId: number,
  programId: string,
): Promise<LiteratureResult | null> {
  const program = await requireProgramInOrg(orgId, programId);
  if (!program) return null;

  const productName = program.productName || program.name;
  const currentYear = new Date().getFullYear();
  const buckets: LiteratureBucket[] = [];
  for (let y = currentYear - 5; y <= currentYear; y++) {
    buckets.push({ year: y, hits: 0 });
  }

  try {
    const result = await pool.query<{ year: number; n: number }>(
      `SELECT EXTRACT(YEAR FROM publication_date)::int AS year, COUNT(*)::int AS n
         FROM literature_entries
        WHERE organization_id::text = $1::text
          AND ( title  ILIKE $2 OR abstract ILIKE $2 )
          AND publication_date >= $3
        GROUP BY 1
        ORDER BY 1`,
      [String(orgId), `%${productName}%`, `${currentYear - 5}-01-01`],
    );
    const byYear = new Map<number, number>(result.rows.map((r) => [r.year, r.n]));
    for (const b of buckets) {
      const y = byYear.get(b.year);
      if (y) b.hits = y;
    }
  } catch (err: unknown) {
    if (!isPgUndefinedTable(err)) throw err;
  }

  const total = buckets.reduce((s, b) => s + b.hits, 0);
  return { buckets, total, productName };
}

/* ─── PMA modules ────────────────────────────────────────────── */

const PMA_MODULE_DEFS: Array<{
  id: PmaModule['id'];
  label: string;
  desc: string;
  categories: string[];
  keyPatterns: string[];
}> = [
  { id: 'preclinical',   label: 'Preclinical',   desc: 'Bench, animal, biocompatibility',
    categories: ['testing', 'preclinical'], keyPatterns: ['preclinical', 'biocompat', 'bench', 'animal', 'sterilization'] },
  { id: 'clinical',      label: 'Clinical',      desc: 'Pivotal trial — enrollment + safety',
    categories: ['clinical'], keyPatterns: ['clinical', 'pivotal', 'investigation', 'ide'] },
  { id: 'manufacturing', label: 'Manufacturing', desc: 'QS Regulation 21 CFR 820',
    categories: ['device'], keyPatterns: ['manufacturing', 'production', 'cmc', 'process'] },
  { id: 'labeling',      label: 'Labeling',      desc: 'Professional labeling · IFU',
    categories: ['additional'], keyPatterns: ['labeling', 'ifu', 'instructions-for-use', 'prof-label'] },
  { id: 'statistical',   label: 'Statistical',   desc: 'SAP · interim analysis · borrowing',
    categories: [], keyPatterns: ['stat', 'sap', 'analysis-plan', 'interim'] },
  { id: 'financial',     label: 'Financial',     desc: 'Investigator disclosures · user fee',
    categories: ['administrative'], keyPatterns: ['financial', 'user-fee', 'disclosure', 'cover-sheet'] },
];

/** Group cerv2_510k_sections rows for the program's org by the kit's
 *  PMA module taxonomy. Section.category + section.sectionKey patterns
 *  determine which module each section rolls into. */
export async function getPmaModules(
  orgId: number,
  programId: string,
): Promise<PmaModule[] | null> {
  const program = await requireProgramInOrg(orgId, programId);
  if (!program) return null;

  const sections = await db
    .select({
      category:   cerv2510kSections.category,
      sectionKey: cerv2510kSections.sectionKey,
      status:     cerv2510kSections.status,
      completion: cerv2510kSections.completionPercentage,
    })
    .from(cerv2510kSections)
    .where(eq(cerv2510kSections.organizationId, orgId));

  return PMA_MODULE_DEFS.map((def) => {
    const matched = sections.filter((s) => {
      const cat = (s.category ?? '').toLowerCase();
      const key = (s.sectionKey ?? '').toLowerCase();
      return def.categories.includes(cat) || def.keyPatterns.some((p) => key.includes(p));
    });
    const total = matched.length;
    if (total === 0) {
      return { id: def.id, label: def.label, desc: def.desc, docs: 0, status: 'draft' as const };
    }
    const allDone = matched.every((m) => ['validated', 'approved'].includes(m.status ?? ''));
    const anyReview = matched.some((m) => ['ready_for_review', 'in_review'].includes(m.status ?? ''));
    const anyTodo  = matched.some((m) => (m.status ?? 'todo') === 'todo');
    let status: PmaModule['status'];
    if (allDone)         status = 'complete';
    else if (anyReview)  status = 'review';
    else if (anyTodo)    status = 'draft';
    else                 status = 'active';
    return { id: def.id, label: def.label, desc: def.desc, docs: total, status };
  });
}

/* ─── PMA trial metrics ──────────────────────────────────────── */

/** Bind program to a clinical_ops.studies row (via metadata override or
 *  fuzzy productName match) and compute the kit's 4 trial KPIs. */
export async function getPmaTrialMetrics(
  orgId: number,
  programId: string,
): Promise<PmaTrialMetricsResult | null> {
  const program = await requireProgramInOrg(orgId, programId);
  if (!program) return null;

  const meta = (program.metadata as Record<string, unknown> | null) ?? {};
  const overrideStudyId = typeof meta.clinicalStudyId === 'string' ? meta.clinicalStudyId : null;
  const productLike = `%${(program.productName ?? program.name ?? '').slice(0, 60)}%`;

  let study: ClinicalOpsStudyRow | null = null;
  try {
    const r = await pool.query<ClinicalOpsStudyRow>(
      overrideStudyId
        ? `SELECT * FROM clinical_ops.studies WHERE id = $1 AND org_id::text = $2 LIMIT 1`
        : `SELECT * FROM clinical_ops.studies
            WHERE org_id::text = $1
              AND (name ILIKE $2 OR indication ILIKE $2 OR therapeutic_area ILIKE $2)
            ORDER BY updated_at DESC LIMIT 1`,
      overrideStudyId ? [overrideStudyId, String(orgId)] : [String(orgId), productLike],
    );
    study = r.rows[0] ?? null;
  } catch (err: unknown) {
    const code = (err as PgError).code;
    if (code !== '42P01' && code !== '3F000') throw err;
  }

  if (!study) {
    return {
      metrics: [
        { label: 'Enrolled',          metric: '—', meta: 'No study linked', tone: 'warn' },
        { label: 'Sites active',      metric: '—', meta: 'No study linked' },
        { label: 'AE rate',           metric: '—', unit: '%', meta: 'Pending enrollment' },
        { label: 'Endpoints achieved',metric: '—', meta: 'Pending interim analysis' },
      ],
      study: null,
    };
  }

  const enrolled     = Number(study.enrolled ?? 0);
  const targetEnroll = Number(study.target_enrollment ?? 0);
  const enrollPct    = targetEnroll > 0 ? Math.round((enrolled / targetEnroll) * 100) : 0;
  const totalSites   = Number(study.sites ?? 0);
  const activeSites  = Number(study.active_sites ?? 0);
  const enrollTone: 'ok' | 'warn' | 'err' = enrollPct >= 80 ? 'ok' : enrollPct >= 50 ? 'warn' : 'err';

  let aeRate: number | null = null;
  try {
    const aeQ = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM clinical_ops.deviations
        WHERE study_id = $1 AND severity IN ('serious','critical')`,
      [study.id],
    );
    const ae = aeQ.rows[0]?.n ?? 0;
    aeRate = enrolled > 0 ? Math.round((ae / enrolled) * 1000) / 10 : 0;
  } catch (err: unknown) {
    if (!isPgUndefinedTable(err)) throw err;
  }

  let endpointsAchieved: number | null = null;
  let endpointsTotal: number | null = null;
  try {
    const epQ = await pool.query<{ achieved: number; total: number }>(
      `SELECT
          COUNT(*) FILTER (WHERE status = 'achieved')::int AS achieved,
          COUNT(*)::int AS total
         FROM clinical_ops.endpoint_results
        WHERE study_id = $1`,
      [study.id],
    );
    endpointsAchieved = epQ.rows[0]?.achieved ?? null;
    endpointsTotal    = epQ.rows[0]?.total ?? null;
  } catch (err: unknown) {
    if (!isPgUndefinedTable(err)) throw err;
  }

  const metrics: TrialMetric[] = [
    { label: 'Enrolled',
      metric: `${enrolled.toLocaleString()}/${targetEnroll.toLocaleString()}`,
      bar:    { pct: enrollPct, tone: enrollTone },
      meta:   `${enrollPct}% of target`,
      tone:   enrollTone },
    { label: 'Sites active',
      metric: `${activeSites}/${totalSites}`,
      meta:   totalSites > 0 ? `${Math.round((activeSites / totalSites) * 100)}% activated` : 'No sites yet',
      tone:   activeSites === 0 ? 'warn' : undefined },
    { label: 'AE rate',
      metric: aeRate !== null ? aeRate.toFixed(1) : '—',
      unit:   aeRate !== null ? '%' : undefined,
      meta:   aeRate !== null ? `Serious + critical / enrolled` : 'No AE data',
      tone:   aeRate !== null && aeRate > 5 ? 'err' : aeRate !== null && aeRate > 2 ? 'warn' : 'ok' },
    { label: 'Endpoints achieved',
      metric: endpointsTotal !== null && endpointsTotal > 0
        ? `${endpointsAchieved}/${endpointsTotal}`
        : '—',
      meta:   endpointsTotal !== null && endpointsTotal > 0
        ? 'Pre-specified primary + secondary'
        : 'Pending interim analysis' },
  ];

  return {
    metrics,
    study: { id: study.id, name: study.name, phase: study.phase, status: study.status },
  };
}

/* ─── Portfolio insights ─────────────────────────────────────── */

/** Compute up to 3 cross-portfolio insights for the org: pathway
 *  clearance ratio, most-common predicate K-numbers, literature
 *  density. Each insight is data-derived, not authored. Returns a
 *  "getting started" hint if no insights are computable yet. */
export async function getPortfolioInsights(orgId: number): Promise<PortfolioInsight[]> {
  const programs = await db
    .select({
      id:              regulatoryPrograms.id,
      productName:     regulatoryPrograms.productName,
      name:            regulatoryPrograms.name,
      programType:     regulatoryPrograms.programType,
      regulatoryPath:  regulatoryPrograms.regulatoryPath,
      status:          regulatoryPrograms.status,
      phase:           regulatoryPrograms.phase,
    })
    .from(regulatoryPrograms)
    .where(eq(regulatoryPrograms.organizationId, orgId));

  const completedStatuses = new Set(['approved', 'submitted', 'completed', 'cleared']);
  const completed = programs.filter((p) => completedStatuses.has((p.status ?? '').toLowerCase()));
  const path = (p: typeof programs[number]) => {
    const rp = (p.regulatoryPath ?? '').toLowerCase();
    const tp = (p.programType ?? '').toUpperCase();
    if (rp === '510k' || tp === '510K' || tp === 'DE_NOVO') return '510(k)';
    if (rp === 'pma'  || tp === 'PMA') return 'PMA';
    if (rp === 'cer'  || tp === 'CER') return 'CER';
    return tp;
  };

  const insights: PortfolioInsight[] = [];

  /* Insight 1 — pathway clearance ratio. */
  if (completed.length > 0) {
    const k510 = completed.filter((p) => path(p) === '510(k)').length;
    const total = completed.length;
    const pct = Math.round((k510 / total) * 100);
    insights.push({
      kind: 'clearance-mix',
      body: `Your portfolio: ${k510} of ${total} cleared programs went via 510(k) (${pct}%).`,
    });
  } else if (programs.length > 0) {
    insights.push({
      kind: 'clearance-mix',
      body: `${programs.length} active program${programs.length === 1 ? '' : 's'} in flight — no clearances yet to compare.`,
    });
  }

  /* Insight 2 — most-common predicate K-numbers across sections. */
  try {
    const r = await pool.query<{ k: string; programs: number }>(
      `SELECT match[1] AS k, COUNT(DISTINCT s.id)::int AS programs
         FROM cerv2_510k_sections s,
              regexp_matches(s.content, '\\b(K\\d{6})\\b', 'g') AS match
        WHERE s.organization_id = $1
        GROUP BY 1
        ORDER BY programs DESC, k
        LIMIT 3`,
      [orgId],
    );
    if (r.rows.length > 0) {
      const top = r.rows.map((row) => `${row.k} (${row.programs})`).join(', ');
      insights.push({
        kind: 'common-predicate',
        body: `Most-referenced predicates across your dossier: ${top}.`,
      });
    }
  } catch (err: unknown) {
    const code = (err as PgError).code;
    if (code !== '42P01' && code !== '42883') throw err;
  }

  /* Insight 3 — literature density. */
  try {
    const productNames = programs.map((p) => p.productName ?? p.name).filter(Boolean);
    if (productNames.length > 0) {
      const r = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
           FROM literature_entries
          WHERE organization_id::text = $1::text`,
        [String(orgId)],
      );
      const total = r.rows[0]?.total ?? 0;
      const avgPerProg = programs.length > 0 ? Math.round(total / programs.length) : 0;
      if (total > 0) {
        const lowFlag = avgPerProg < 250 ? ' — below the EU MDR Article 61 ≥250 threshold for sufficient clinical evidence' : '';
        insights.push({
          kind: 'literature-density',
          body: `Literature corpus: ${total.toLocaleString()} entries across the portfolio (avg ${avgPerProg}/program)${lowFlag}.`,
        });
      }
    }
  } catch (err: unknown) {
    if (!isPgUndefinedTable(err)) throw err;
  }

  if (insights.length === 0) {
    insights.push({
      kind: 'getting-started',
      body: 'Insights appear here once your portfolio has cleared programs, predicate references, or literature entries.',
    });
  }

  return insights;
}
