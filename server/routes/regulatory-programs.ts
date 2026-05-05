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
import { db } from '../db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { users, auditLogs, cerv2510kSections } from '../../shared/schema';
import { qSubmissions, qSubMeetings } from '../../shared/schema/q-sub';
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
import { qSubCommitments, qSubQuestions } from '../../shared/schema/q-sub';
import { deviceTestStandards } from '../../shared/schema';

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

void auditService;

export default router;
