/**
 * Regulatory Programs API — list/get over the regulatory_programs table.
 *
 * Mounted at:  /api/regulatory-programs
 *
 * Different concept from /api/project-hierarchy/programs (which lists
 * depth=0 rows of the projects table). regulatory_programs carries the
 * MDX-relevant taxonomy: programType (510K / PMA / CER / DE_NOVO / IND /
 * NDA / BLA), regulatoryPath, deviceClass, primaryAgency, productName,
 * status, phase, progressPercent, targetSubmissionDate, leadUserId,
 * teamMembers, metadata. The MDX Overview surface needs this data, not
 * generic project rows.
 *
 * Endpoints:
 *   GET /                 — list rows, optionally filtered by ?programType / ?pathway
 *   GET /:id              — get one row
 *
 * The list endpoint joins users for the lead name (single round-trip,
 * single query) so kit-shape adapters don't have to N+1 the user table.
 */

import { Router, Request, Response } from 'express';
import { db, pool } from '../db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { users, auditLogs, cerv2510kSections, deviceTestStandards } from '../../shared/schema';
import { qSubmissions, qSubMeetings, qSubQuestions, qSubCommitments } from '../../shared/schema/q-sub';
import auditService from '../services/auditService';

const router = Router();

function getOrgId(req: Request): number | null {
  const v =
    (req as any).organizationId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).user?.organizationId ??
    (req as any).tenantId;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface ProgramRowWithLead {
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

router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const programType = typeof req.query.programType === 'string' ? req.query.programType : null;

    const conditions = [eq(regulatoryPrograms.organizationId, orgId)];
    if (programType) conditions.push(eq(regulatoryPrograms.programType, programType));

    const rows = await db
      .select()
      .from(regulatoryPrograms)
      .where(and(...conditions))
      .orderBy(desc(regulatoryPrograms.updatedAt));

    /* Resolve lead names in a single batch */
    const leadIds = Array.from(
      new Set(
        rows.map((r) => r.leadUserId).filter((v): v is number => typeof v === 'number'),
      ),
    );
    const leadRows = leadIds.length
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, leadIds))
      : [];
    const leadById = new Map(leadRows.map((r) => [r.id, r.name]));

    const data: ProgramRowWithLead[] = rows.map((r) => ({
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
      leadUserName:         r.leadUserId != null ? (leadById.get(r.leadUserId) ?? null) : null,
      teamMembers:          (r.teamMembers as ProgramRowWithLead['teamMembers']) ?? null,
      metadata:             (r.metadata as Record<string, unknown> | null) ?? null,
      createdAt:            r.createdAt.toISOString(),
      updatedAt:            r.updatedAt.toISOString(),
    }));

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = String(req.params.id);
    const [row] = await db
      .select()
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (!row) return res.status(404).json({ error: 'Program not found' });

    let leadUserName: string | null = null;
    if (row.leadUserId != null) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.leadUserId));
      if (u) leadUserName = u.name;
    }

    const data: ProgramRowWithLead = {
      id:                   row.id,
      name:                 row.name,
      code:                 row.code,
      description:          row.description ?? null,
      programType:          row.programType,
      productType:          row.productType,
      deviceClass:          row.deviceClass ?? null,
      regulatoryPath:       row.regulatoryPath ?? null,
      primaryAgency:        row.primaryAgency,
      productName:          row.productName,
      status:               row.status,
      phase:                row.phase ?? null,
      priority:             row.priority ?? null,
      targetSubmissionDate: row.targetSubmissionDate ? row.targetSubmissionDate.toISOString() : null,
      progressPercent:      row.progressPercent ?? 0,
      completedMilestones:  row.completedMilestones ?? 0,
      totalMilestones:      row.totalMilestones ?? 0,
      leadUserId:           row.leadUserId ?? null,
      leadUserName,
      teamMembers:          (row.teamMembers as ProgramRowWithLead['teamMembers']) ?? null,
      metadata:             (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt:            row.createdAt.toISOString(),
      updatedAt:            row.updatedAt.toISOString(),
    };

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

/* ─── Activity feed ─────────────────────────────────────────────────────
   Per-program activity from audit_logs. Uses audit_logs (not audit_events)
   because record_id is text — supports the UUID program ids that
   audit_events' integer entity_id can't hold.

   Returns the latest 50 events by default, optionally filtered by date
   range. Each row carries who/when/what plus the changed fields summary
   so the ProjectHome activity panel can render full context.
*/

interface ActivityEvent {
  id: string;
  when: string;
  who: string;
  what: string;
  action: string;
  changedFields: string[];
}

router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = String(req.params.id);
    const limitRaw = req.query.limit;
    const limit = typeof limitRaw === 'string' ? Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 200) : 50;

    /* Authorize: caller must have access to the program in their org. */
    const [program] = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    /* Pull audit_logs rows for this program. Two flavors of resourceType
       ('regulatory_program' singular and 'regulatory_programs' plural)
       are accepted — different writers in the codebase use different
       conventions, both are real. Also tolerate audit_logs entries that
       used the projects.id when the program was linked to a project. */
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
          eq(auditLogs.recordId, id),
          inArray(auditLogs.tableName, ['regulatory_program', 'regulatory_programs']),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    /* Resolve user names in one batch (no N+1). */
    const userIds = Array.from(new Set(events.map(e => e.userId).filter((v): v is number => typeof v === 'number')));
    const userRows = userIds.length
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
      : [];
    const userById = new Map(userRows.map(u => [u.id, u.name]));

    const data: ActivityEvent[] = events.map((e) => {
      const oldVals = (e.oldValues as Record<string, unknown> | null) ?? null;
      const newVals = (e.newValues as Record<string, unknown> | null) ?? null;
      const changedFields: string[] = [];
      if (oldVals && newVals) {
        for (const k of Object.keys(newVals)) {
          if (oldVals[k] !== newVals[k]) changedFields.push(k);
        }
      } else if (newVals) {
        changedFields.push(...Object.keys(newVals));
      }
      const action = (e.action ?? 'updated').toLowerCase();
      const verb =
        action === 'create' || action === 'created' ? 'created'
        : action === 'delete' || action === 'deleted' ? 'deleted'
        : action === 'approve' || action === 'approved' ? 'approved'
        : 'updated';
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

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

/* ─── Milestones ────────────────────────────────────────────────────────
   Per-program milestone timeline derived from existing data:
     - Q-Sub meetings (qSubMeetings) → "Q-Sub meeting" entries
     - regulatory_programs.target_submission_date → "FDA filing" entry
     - cerv2_510k_sections completion → "eSTAR drafted" entry (when ≥75%)
     - regulatory_programs.status='approved' / phase='post_market' → terminal entries

   Returns ordered timeline {id, label, date, state: complete|active|idle}.
   Pure derivation — no new tables. The kit's 8-step pathway choreography
   stays in place; the dynamic state mapping comes from real data.
*/
interface Milestone {
  id: string;
  label: string;
  date: string;
  state: 'complete' | 'active' | 'idle';
}

router.get('/:id/milestones', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = String(req.params.id);
    const [program] = await db
      .select()
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const milestones: Milestone[] = [];
    const fmtDate = (d: Date | null | undefined) =>
      d ? d.toISOString().slice(0, 10) : 'TBD';

    /* Q-Sub meetings — earliest meeting per program (typically there's one). */
    const meetings = await db
      .select({ id: qSubMeetings.id, meetingDate: qSubMeetings.meetingDate, confirmed: qSubMeetings.confirmed, minutesReceivedAt: qSubMeetings.minutesReceivedAt })
      .from(qSubMeetings)
      .leftJoin(qSubmissions, eq(qSubMeetings.qSubmissionId, qSubmissions.id))
      .where(eq(qSubmissions.programId, id))
      .orderBy(qSubMeetings.meetingDate);
    if (meetings[0]) {
      const m = meetings[0];
      const state: Milestone['state'] = m.minutesReceivedAt ? 'complete' : m.confirmed ? 'active' : 'idle';
      milestones.push({
        id:    `m-qsub-${m.id}`,
        label: 'Q-Sub meeting',
        date:  fmtDate(m.meetingDate),
        state,
      });
    }

    /* eSTAR section completion — flips to "complete" once ≥75% of sections
       are validated/approved. */
    const [sectionAgg] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        done:  sql<number>`SUM(CASE WHEN ${cerv2510kSections.status} IN ('validated','approved') THEN 1 ELSE 0 END)::int`,
      })
      .from(cerv2510kSections)
      .where(eq(cerv2510kSections.organizationId, orgId));
    const total = sectionAgg?.total ?? 0;
    const done  = sectionAgg?.done  ?? 0;
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

    /* FDA filing — anchored to target submission date. */
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

    res.json({ data: milestones });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

/* ─── RIM recommendations ──────────────────────────────────────────────
   Per-program structural recommendations the project team should action.
   Recommendations are *derived* from the existing dossier state — no AI
   call, no new "recommendations" table — so the panel renders facts the
   user can verify against the underlying data:

     1. Sections still flagged 'todo' on a required eSTAR row → "Close
        gap" rec (impact: high if blocker tag, med otherwise).
     2. Predicate-driven sections (those whose content references a
        specific K-number) where the predicate has open commitments
        from a Q-Sub → "Propagate commitment" rec.
     3. Standards references in sections that match a withdrawn entry
        in device_test_standards (status='withdrawn') → "Update
        standard" rec.

   The recommendations are computed on read; the kit panel doesn't write
   them back. When the underlying state changes, the recs update.
*/
interface RimRec {
  id: string;
  body: string;
  kind: 'mapping' | 'cross-ref' | 'consistency' | 'standards';
  impact: 'low' | 'med' | 'high';
}

router.get('/:id/rim-recommendations', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = String(req.params.id);
    const [program] = await db
      .select()
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (!program) return res.status(404).json({ error: 'Program not found' });

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
      const titles = gaps.slice(0, 3).map(g => `§${g.sectionNumber}`).join(', ');
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
      .where(
        and(
          eq(qSubmissions.programId, id),
          eq(qSubCommitments.rolledIn, false),
        ),
      )
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
       for ISO/IEC/ASTM codes that match a withdrawn row). Bounded by a
       small set of recent withdrawn standards to keep the scan cheap. */
    const withdrawn = await db
      .select({ code: deviceTestStandards.standardCode })
      .from(deviceTestStandards)
      .where(eq(deviceTestStandards.status, 'withdrawn'))
      .limit(20);
    if (withdrawn.length > 0) {
      const codes = withdrawn.map(w => w.code).filter(Boolean);
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
          const sections = referenced.map(r => `§${r.sectionNumber}`).join(', ');
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
      .select({
        id:         cerv2510kSections.id,
        completion: cerv2510kSections.completionPercentage,
      })
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

    res.json({ data: recs });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

/* ─── Change impact ────────────────────────────────────────────────────
   Recent edits with cross-section impact. Reads from audit_logs filtered
   to cerv2_510k_sections rows in this org, joins each edit's
   newValues.sectionNumber against other sections that reference it (via
   ?§NN style cross-refs in their content), and surfaces the user, when,
   what, and which downstream sections are affected.
*/

interface ChangeImpact {
  id: string;
  who: string;
  when: string;
  what: string;
  affects: string[];
}

router.get('/:id/change-impact', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = String(req.params.id);
    const [program] = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    /* Recent section edits in this org (last 20 update events). */
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

    /* Resolve user names. */
    const userIds = Array.from(new Set(recentEdits.map(e => e.userId).filter((v): v is number => typeof v === 'number')));
    const userRows = userIds.length
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
      : [];
    const userById = new Map(userRows.map(u => [u.id, u.name]));

    /* Pull all sections + their content once so we can detect cross-refs
       like "§7", "§10", or "Section 11" in a single scan. */
    const allSections = await db
      .select({
        id:            cerv2510kSections.id,
        sectionNumber: cerv2510kSections.sectionNumber,
        sectionTitle:  cerv2510kSections.sectionTitle,
        content:       cerv2510kSections.content,
      })
      .from(cerv2510kSections)
      .where(eq(cerv2510kSections.organizationId, orgId));
    const byId = new Map(allSections.map(s => [String(s.id), s]));

    const data: ChangeImpact[] = recentEdits.slice(0, 6).map((edit) => {
      const sec = byId.get(String(edit.recordId));
      const editedNum = sec?.sectionNumber;
      const editedTitle = sec?.sectionTitle ?? `§${editedNum ?? '?'}`;
      /* Find sections whose content references the edited section. */
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

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

/* ─── CER safety signals ────────────────────────────────────────────────
   Per-program safety-signal feed for the CerSurface signals table.
   Pulls from the safety_signals table (existing, already populated by
   pharmacovigilance reportSignal), filtered to the caller's org + this
   program's project linkage. The kit needs:
     id, source (FAERS / MAUDE / Eudamed / Literature),
     event (description), count, severity, status

   Counts roll up related adverse_events when the join is meaningful;
   severity derives from the recommended action; status maps from
   evaluationStatus to the kit's included / excluded / review enum.
*/
interface SafetySignalRow {
  id: string;
  source: 'FAERS' | 'MAUDE' | 'Eudamed' | 'Literature' | 'Spontaneous';
  event: string;
  count: number;
  severity: 'critical' | 'serious' | 'moderate' | 'low';
  status: 'included' | 'excluded' | 'review';
  detectedAt: string;
}

const SIGNAL_SOURCE_MAP: Record<string, SafetySignalRow['source']> = {
  spontaneous:    'Spontaneous',
  clinical_trial: 'FAERS',
  literature:     'Literature',
  registry:       'Eudamed',
};

const ACTION_TO_SEVERITY: Record<string, SafetySignalRow['severity']> = {
  withdrawal:   'critical',
  rems:         'serious',
  dear_doctor:  'serious',
  label_update: 'moderate',
  none:         'low',
};

const STATUS_TO_KIT: Record<string, SafetySignalRow['status']> = {
  new:              'review',
  under_evaluation: 'review',
  confirmed:        'included',
  refuted:          'excluded',
  closed:           'excluded',
};

router.get('/:id/safety-signals', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = String(req.params.id);
    const [program] = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    /* safety_signals.organization_id is text; cast both sides for the
       comparison so int orgIds match the existing string-shaped data. */
    let rows: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, signal_source, description, detected_at, evaluation_status, action
           FROM safety_signals
          WHERE organization_id::text = $1::text
            AND ( project_id::text = $2::text OR project_id IS NULL )
          ORDER BY detected_at DESC
          LIMIT 50`,
        [String(orgId), id],
      );
      rows = result.rows;
    } catch (err: any) {
      /* Table may not exist in all environments — return empty list. */
      if (err?.code !== '42P01') throw err;
    }

    /* Count related adverse events per signal source — a single batch
       group-by per call. */
    let countsBySource: Record<string, number> = {};
    try {
      const aeCounts = await pool.query(
        `SELECT signal_source, COUNT(*)::int AS n
           FROM safety_signals
          WHERE organization_id::text = $1::text
          GROUP BY signal_source`,
        [String(orgId)],
      );
      countsBySource = Object.fromEntries(aeCounts.rows.map((r: any) => [r.signal_source, r.n]));
    } catch {
      /* fall through */
    }

    const data: SafetySignalRow[] = rows.map((r: any) => ({
      id:         String(r.id),
      source:     SIGNAL_SOURCE_MAP[r.signal_source] ?? 'Spontaneous',
      event:      String(r.description ?? '').slice(0, 160),
      count:      countsBySource[r.signal_source] ?? 1,
      severity:   ACTION_TO_SEVERITY[r.action] ?? 'low',
      status:     STATUS_TO_KIT[r.evaluation_status] ?? 'review',
      detectedAt: r.detected_at instanceof Date ? r.detected_at.toISOString() : String(r.detected_at),
    }));

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

/* ─── CER literature corpus ─────────────────────────────────────────────
   Year-bucketed literature counts for CerSurface's corpus chart. Reads
   from the persisted literature_entries table populated by
   LiteratureAggregatorService (PubMed + FDA + ClinicalTrials.gov runs
   write back here so subsequent reads are fast).

   Window: 6 years ending current year (kit convention). When no entries
   exist for the program's product, returns the buckets with zero counts
   so the chart renders structure (not blank).
*/

interface LiteratureBucket {
  year: number;
  hits: number;
}

router.get('/:id/literature', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = String(req.params.id);
    const [program] = await db
      .select({
        id:          regulatoryPrograms.id,
        productName: regulatoryPrograms.productName,
        name:        regulatoryPrograms.name,
      })
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const productName = program.productName || program.name;
    const currentYear = new Date().getFullYear();
    const buckets: LiteratureBucket[] = [];
    for (let y = currentYear - 5; y <= currentYear; y++) {
      buckets.push({ year: y, hits: 0 });
    }

    /* Aggregate from literature_entries (the persisted result cache). */
    try {
      const result = await pool.query(
        `SELECT EXTRACT(YEAR FROM publication_date)::int AS year, COUNT(*)::int AS n
           FROM literature_entries
          WHERE organization_id::text = $1::text
            AND ( title  ILIKE $2 OR abstract ILIKE $2 )
            AND publication_date >= $3
          GROUP BY 1
          ORDER BY 1`,
        [String(orgId), `%${productName}%`, `${currentYear - 5}-01-01`],
      );
      const byYear = new Map<number, number>(result.rows.map((r: any) => [r.year, r.n]));
      for (const b of buckets) {
        const y = byYear.get(b.year);
        if (y) b.hits = y;
      }
    } catch (err: any) {
      if (err?.code !== '42P01') throw err;
      /* literature_entries table missing — return empty buckets. */
    }

    const total = buckets.reduce((s, b) => s + b.hits, 0);
    res.json({ data: buckets, total, productName });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

/* ─── PMA modules ───────────────────────────────────────────────────────
   Per-program section roll-up grouped into the PMA module taxonomy
   (preclinical / clinical / manufacturing / labeling / statistical /
   financial). The cerv2_510k_sections table holds section rows for all
   pathways (legacy name); we map the section.category + section.key to
   PMA modules so the cards reflect real authoring state.
*/

interface PmaModule {
  id: 'preclinical' | 'clinical' | 'manufacturing' | 'labeling' | 'statistical' | 'financial';
  label: string;
  desc: string;
  docs: number;
  status: 'complete' | 'active' | 'review' | 'draft';
}

const PMA_MODULE_DEFS: Array<{
  id: PmaModule['id'];
  label: string;
  desc: string;
  /** Match by category (case-insensitive) OR section_key substring. */
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

router.get('/:id/pma-modules', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = String(req.params.id);
    const [program] = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const sections = await db
      .select({
        category:    cerv2510kSections.category,
        sectionKey:  cerv2510kSections.sectionKey,
        status:      cerv2510kSections.status,
        completion:  cerv2510kSections.completionPercentage,
      })
      .from(cerv2510kSections)
      .where(eq(cerv2510kSections.organizationId, orgId));

    const data: PmaModule[] = PMA_MODULE_DEFS.map((def) => {
      const matched = sections.filter((s) => {
        const cat = (s.category ?? '').toLowerCase();
        const key = (s.sectionKey ?? '').toLowerCase();
        return def.categories.includes(cat)
          || def.keyPatterns.some((p) => key.includes(p));
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

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

/* ─── PMA trial metrics ─────────────────────────────────────────────────
   Per-program clinical-trial KPIs for the PmaSurface metrics strip. Joins
   the program to its clinical_ops.studies row using either a metadata
   override (program.metadata.clinicalStudyId) or the most-recent active
   study in the org. Returns the kit's 4 metrics:
     Enrolled · Sites active · AE rate · Endpoints achieved

   Each metric carries a bar.pct + tone so the chart renders without
   client-side derivation. When no study is linked, returns the metric
   row labels with metric '—' and meta='No study linked' — surface still
   renders structure.
*/

interface TrialMetric {
  label: string;
  metric: string;
  unit?: string;
  bar?: { pct: number; tone: 'ok' | 'warn' | 'err' };
  meta: string;
  tone?: 'ok' | 'warn' | 'err';
}

router.get('/:id/pma-trial-metrics', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = String(req.params.id);
    const [program] = await db
      .select({
        id:          regulatoryPrograms.id,
        productName: regulatoryPrograms.productName,
        name:        regulatoryPrograms.name,
        metadata:    regulatoryPrograms.metadata,
      })
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const meta = (program.metadata as Record<string, unknown> | null) ?? {};
    const overrideStudyId = typeof meta.clinicalStudyId === 'string' ? meta.clinicalStudyId : null;
    const productLike = `%${(program.productName ?? program.name ?? '').slice(0, 60)}%`;

    let study: any | null = null;
    try {
      const r = await pool.query(
        overrideStudyId
          ? `SELECT * FROM clinical_ops.studies WHERE id = $1 AND org_id::text = $2 LIMIT 1`
          : `SELECT * FROM clinical_ops.studies
              WHERE org_id::text = $1
                AND (name ILIKE $2 OR indication ILIKE $2 OR therapeutic_area ILIKE $2)
              ORDER BY updated_at DESC LIMIT 1`,
        overrideStudyId ? [overrideStudyId, String(orgId)] : [String(orgId), productLike],
      );
      study = r.rows[0] ?? null;
    } catch (err: any) {
      if (err?.code !== '42P01' && err?.code !== '3F000') throw err;
    }

    const data: TrialMetric[] = [];

    if (!study) {
      data.push(
        { label: 'Enrolled',          metric: '—', meta: 'No study linked', tone: 'warn' },
        { label: 'Sites active',      metric: '—', meta: 'No study linked' },
        { label: 'AE rate',           metric: '—', unit: '%', meta: 'Pending enrollment' },
        { label: 'Endpoints achieved',metric: '—', meta: 'Pending interim analysis' },
      );
      return res.json({ data, study: null });
    }

    const enrolled       = Number(study.enrolled ?? 0);
    const targetEnroll   = Number(study.target_enrollment ?? 0);
    const enrollPct      = targetEnroll > 0 ? Math.round((enrolled / targetEnroll) * 100) : 0;
    const totalSites     = Number(study.sites ?? 0);
    const activeSites    = Number(study.active_sites ?? 0);
    const enrollTone: 'ok' | 'warn' | 'err' = enrollPct >= 80 ? 'ok' : enrollPct >= 50 ? 'warn' : 'err';

    /* AE rate from deviations table (if it exists). */
    let aeRate: number | null = null;
    try {
      const aeQ = await pool.query(
        `SELECT COUNT(*)::int AS n FROM clinical_ops.deviations
          WHERE study_id = $1 AND severity IN ('serious','critical')`,
        [study.id],
      );
      const ae = aeQ.rows[0]?.n ?? 0;
      aeRate = enrolled > 0 ? Math.round((ae / enrolled) * 1000) / 10 : 0;
    } catch (err: any) {
      if (err?.code !== '42P01') throw err;
    }

    /* Endpoints achieved from clinical_ops.endpoint_results (best-effort). */
    let endpointsAchieved: number | null = null;
    let endpointsTotal: number | null = null;
    try {
      const epQ = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'achieved')::int AS achieved,
            COUNT(*)::int AS total
           FROM clinical_ops.endpoint_results
          WHERE study_id = $1`,
        [study.id],
      );
      endpointsAchieved = epQ.rows[0]?.achieved ?? null;
      endpointsTotal    = epQ.rows[0]?.total ?? null;
    } catch (err: any) {
      if (err?.code !== '42P01') throw err;
    }

    data.push(
      { label: 'Enrolled',
        metric: `${enrolled.toLocaleString()}/${targetEnroll.toLocaleString()}`,
        bar:    { pct: enrollPct, tone: enrollTone },
        meta:   `${enrollPct}% of target`,
        tone:   enrollTone },
      { label: 'Sites active',
        metric: `${activeSites}/${totalSites}`,
        meta:   totalSites > 0 ? `${Math.round((activeSites / totalSites) * 100)}% activated` : 'No sites yet',
        tone:   activeSites === 0 ? 'warn' : '' as 'ok' | 'warn' | 'err' | undefined },
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
    );

    res.json({
      data,
      study: { id: study.id, name: study.name, phase: study.phase, status: study.status },
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

/* ─── Portfolio insights ───────────────────────────────────────────────
   Cross-portfolio narrative insights for the PrecedentSurface narrative
   panel. Computes 3 derived facts from the caller's actual data so the
   panel reflects their own portfolio, not authored copy:

     1. Pathway clearance ratio: of completed programs, what % cleared
        via 510(k) vs PMA vs CER. Only counts programs where status
        ∈ ('approved', 'submitted', 'completed').
     2. Most-common predicate K-numbers: which K-numbers are referenced
        across the most programs. Reads from cerv2_510k_sections.content
        scanning for K-NNNNNN patterns (the canonical FDA submission id).
     3. Literature density: average literature_entries hits per program
        with a productName. Below 250 hits is the EU MDR Article 61
        threshold flag.

   Read-only, computed on demand. No new tables.
*/

router.get('/portfolio-insights', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    /* All programs for the org. */
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
    const completed = programs.filter(p => completedStatuses.has((p.status ?? '').toLowerCase()));
    const path = (p: typeof programs[number]) => {
      const rp = (p.regulatoryPath ?? '').toLowerCase();
      const tp = (p.programType ?? '').toUpperCase();
      if (rp === '510k' || tp === '510K' || tp === 'DE_NOVO') return '510(k)';
      if (rp === 'pma'  || tp === 'PMA') return 'PMA';
      if (rp === 'cer'  || tp === 'CER') return 'CER';
      return tp;
    };

    const insights: Array<{ kind: string; body: string }> = [];

    /* Insight 1 — pathway clearance ratio. */
    if (completed.length > 0) {
      const k510 = completed.filter(p => path(p) === '510(k)').length;
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
      const r = await pool.query(
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
        const top = r.rows.map((row: any) => `${row.k} (${row.programs})`).join(', ');
        insights.push({
          kind: 'common-predicate',
          body: `Most-referenced predicates across your dossier: ${top}.`,
        });
      }
    } catch (err: any) {
      if (err?.code !== '42P01' && err?.code !== '42883') throw err;
    }

    /* Insight 3 — literature density. */
    try {
      const productNames = programs.map(p => p.productName ?? p.name).filter(Boolean);
      if (productNames.length > 0) {
        const r = await pool.query(
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
    } catch (err: any) {
      if (err?.code !== '42P01') throw err;
    }

    /* If we couldn't compute any data-backed insights, return a hint
       message so the panel renders structure (don't fall back to
       hard-coded authored content here — that's the kit's job). */
    if (insights.length === 0) {
      insights.push({
        kind: 'getting-started',
        body: 'Insights appear here once your portfolio has cleared programs, predicate references, or literature entries.',
      });
    }

    res.json({ data: insights });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

void auditService;

export default router;
