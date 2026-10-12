/**
 * MDX proactive signals — table-aware alerts AnA surfaces without being asked.
 *
 * Originally a peer of the generic `proactive-commitment-engine` (removed with
 * the formal drop of the staged charter tables — decision register #727,
 * item 10). This module reads the MDX-specific tables (q_submissions,
 * q_sub_commitments, cerv2_510k_sections, regulatory_programs,
 * evidence_sufficiency_assessments) and emits MDX-shaped alerts.
 *
 * The correspondence alert reads `c2c_correspondence` (joined to
 * `c2c_submissions` for the application family) through
 * regulatory-correspondence/response-clock.ts, which holds the response
 * deadline rule. This list once said `regulatory_correspondence` and the code
 * queried `correspondences`; neither exists in this repository, so that alert
 * had never fired, and when it was restored it was restored on the regulation
 * rather than on the 14-day constant it used to carry (2026-10-12).
 *
 * All queries are tenant-scoped via `regulatory_programs.organization_id`.
 * Read-only. Never mutates.
 */

import type { Pool, PoolClient } from 'pg';

import { correspondenceResponseClock } from '../regulatory-correspondence/response-clock';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('mdx-proactive-signals');

export type MdxAlertSeverity = 'info' | 'warn' | 'critical';

export interface MdxAlert {
  /** Stable identifier so the UI can dedupe across refreshes. */
  id: string;
  /** Alert kind keyword for filtering. */
  kind:
    | 'q_sub.target_date_approaching'
    | 'q_sub.commitment_blocker_open'
    | 'estar.section_stale'
    | 'correspondence.no_response'
    | 'evidence_sufficiency.low_near_target'
    | 'program.target_submission_approaching';
  severity: MdxAlertSeverity;
  /** Tenant org id this alert belongs to. */
  organizationId: number;
  /** Program id this alert is about, when applicable. */
  programId?: string;
  /** Short human-readable summary AnA can paraphrase. */
  message: string;
  /** Link the UI / AnA can offer to take action. */
  suggestedTool?: string;
  suggestedSurface?: string;
  /** Structured detail an auditor can read. */
  detail: Record<string, unknown>;
}

export interface MdxProactiveSnapshot {
  organizationId: number;
  generatedAt: string;
  alerts: MdxAlert[];
}

const STALE_SECTION_DAYS = 14;
const Q_SUB_DEADLINE_WARN_DAYS = 14;
const Q_SUB_DEADLINE_CRITICAL_DAYS = 5;
const TARGET_SUBMISSION_WARN_DAYS = 60;
const TARGET_SUBMISSION_CRITICAL_DAYS = 30;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Build the full snapshot for a tenant. Designed to be called once per
 * chat session at context-build time; cheap enough (≤ 5 indexed queries).
 */
export async function buildMdxProactiveSnapshot(
  client: Pool | PoolClient,
  organizationId: number,
): Promise<MdxProactiveSnapshot> {
  const alerts: MdxAlert[] = [];
  const now = new Date();

  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    return { organizationId, generatedAt: now.toISOString(), alerts };
  }

  // ── Q-Sub target_date approaching (filed but not yet feedback) ──
  try {
    const { rows } = await client.query(
      `SELECT q.id, q.q_number, q.title, q.stage, q.target_date,
              p.id::text AS program_id, p.code AS program_code, p.name AS program_name
       FROM q_submissions q
       JOIN regulatory_programs p ON p.id::text = q.program_id
       WHERE p.organization_id = $1
         AND q.stage IN ('await', 'submit', 'package')
         AND q.target_date IS NOT NULL
         AND q.target_date < NOW() + INTERVAL '14 days'
       ORDER BY q.target_date ASC`,
      [organizationId],
    );
    for (const r of rows) {
      const days = daysBetween(now, new Date(r.target_date));
      const severity: MdxAlertSeverity =
        days <= Q_SUB_DEADLINE_CRITICAL_DAYS
          ? 'critical'
          : days <= Q_SUB_DEADLINE_WARN_DAYS
            ? 'warn'
            : 'info';
      alerts.push({
        id: `q-sub-deadline:${r.id}`,
        kind: 'q_sub.target_date_approaching',
        severity,
        organizationId,
        programId: r.program_id,
        message:
          `${r.q_number || 'Q-Sub'} (${r.program_code} — "${r.title}") target date ` +
          `is in ${days} day${days === 1 ? '' : 's'}; current stage is "${r.stage}".`,
        suggestedSurface: 'pre-sub',
        detail: {
          qSubId: r.id,
          qNumber: r.q_number,
          stage: r.stage,
          targetDate: r.target_date,
          daysUntilTarget: days,
        },
      });
    }
  } catch {
    // fail-soft
  }

  // ── Open blocker commitments (rolled_in=false, blocker=true) ──
  try {
    const { rows } = await client.query(
      `SELECT c.id, c.display_code, c.text, c.dossier_link_label, c.dossier_link_section_id,
              q.q_submission_id, qs.q_number, qs.title AS q_sub_title,
              p.id::text AS program_id, p.code AS program_code
       FROM q_sub_commitments c
       JOIN q_sub_questions q ON q.id = c.q_sub_question_id
       JOIN q_submissions qs ON qs.id = q.q_submission_id
       JOIN regulatory_programs p ON p.id::text = qs.program_id
       WHERE p.organization_id = $1
         AND c.blocker = true
         AND c.rolled_in = false
       ORDER BY c.created_at ASC`,
      [organizationId],
    );
    for (const r of rows) {
      alerts.push({
        id: `commitment-blocker:${r.id}`,
        kind: 'q_sub.commitment_blocker_open',
        severity: 'warn',
        organizationId,
        programId: r.program_id,
        message:
          `Open blocker commitment ${r.display_code} on ${r.program_code} ` +
          `(${r.q_number || r.q_sub_title}): "${(r.text as string).slice(0, 120)}". ` +
          `Linked to ${r.dossier_link_label}.`,
        suggestedTool: 'q_sub.commitment.set_rolled_in',
        suggestedSurface: 'pre-sub',
        detail: {
          commitmentId: r.id,
          displayCode: r.display_code,
          dossierLinkLabel: r.dossier_link_label,
          dossierLinkSectionId: r.dossier_link_section_id,
          qSubmissionId: r.q_submission_id,
        },
      });
    }
  } catch {
    // fail-soft
  }

  // ── eSTAR sections that haven't been touched in N days ──
  try {
    const { rows } = await client.query(
      `SELECT s.id, s.section_number, s.section_title, s.status, s.completion_percentage,
              s.updated_at, s.document_id
       FROM cerv2_510k_sections s
       WHERE s.organization_id = $1
         AND s.status NOT IN ('validated', 'approved')
         AND s.updated_at < NOW() - INTERVAL '${STALE_SECTION_DAYS} days'
       ORDER BY s.updated_at ASC
       LIMIT 25`,
      [organizationId],
    );
    for (const r of rows) {
      const days = daysBetween(new Date(r.updated_at), now);
      alerts.push({
        id: `section-stale:${r.id}`,
        kind: 'estar.section_stale',
        severity: days > 30 ? 'warn' : 'info',
        organizationId,
        message:
          `eSTAR §${r.section_number} (${r.section_title}) hasn't been edited in ${days} days; ` +
          `current status "${r.status}", ${r.completion_percentage ?? 0}% complete.`,
        suggestedSurface: 'estar-editor',
        detail: {
          sectionId: r.id,
          sectionNumber: r.section_number,
          status: r.status,
          completionPercentage: r.completion_percentage,
          documentId: r.document_id,
          daysSinceUpdate: days,
        },
      });
    }
  } catch {
    // fail-soft (table may not exist on a fresh tenant)
  }

  /* ── An inbound agency letter still awaiting our response ────────────────
     This read `FROM correspondences`, a table that exists nowhere in this
     repository, inside `catch { // fail-soft … may have a different name in
     some tenants }` — so it threw 42P01 every call, was swallowed, and the
     alert had never once fired (2026-10-12). The real store is
     `c2c_correspondence` (db/migrations/20260331_regulatory_correspondence_os.sql)
     and carries every column that query selected.

     What is NOT restored is its rule. It compared receipt against a single
     platform constant of 14 days, which is not a deadline in any of these
     regimes: a refuse-to-file letter runs 30 days, a complete response letter
     a year, a device Additional Information hold 180 days or the application is
     withdrawn, and a drug information request runs on the date FDA wrote in it
     and no other. The clock is computed by
     regulatory-correspondence/response-clock.ts, which takes the agency's
     stated date ahead of any table, falls back to the governed window for the
     letter class and application family, and reports a letter with neither as
     exactly that rather than as an invented overdue. Bucketing is the same
     rule the Regulatory Deadline Radar uses.

     `upcoming` raises nothing: a CRL eleven months out is not something AnA
     should interrupt anyone about. */
  try {
    const { rows } = await client.query(
      `SELECT c.id, c.subject, c.direction, c.communication_type, c.response_required,
              c.status, c.received_at, c.due_date, c.urgency, c.project_id, c.submission_id,
              s.submission_type
         FROM c2c_correspondence c
         LEFT JOIN c2c_submissions s
                ON s.id = c.submission_id AND s.organization_id = c.organization_id
        WHERE c.organization_id = $1
          AND c.direction = 'inbound'
          AND c.response_required
          AND c.status NOT IN ('responded', 'closed')
        ORDER BY c.received_at ASC NULLS LAST
        LIMIT 100`,
      [organizationId],
    );
    for (const r of rows) {
      const clock = correspondenceResponseClock(
        {
          direction: r.direction,
          communicationType: r.communication_type,
          responseRequired: r.response_required,
          status: r.status,
          receivedAt: r.received_at,
          dueDate: r.due_date,
          submissionType: r.submission_type ?? null,
        },
        now,
      );
      if (clock.state === 'untracked' || (clock.state === 'dated' && clock.bucket === 'upcoming')) continue;

      const subject = String(r.subject ?? 'an agency letter');
      const message =
        clock.state === 'dated'
          ? `${subject} is ${clock.bucket === 'overdue' ? `${Math.abs(clock.daysUntilDue)} day(s) overdue` : `due in ${clock.daysUntilDue} day(s)`}` +
            (clock.dueDateSource === 'agency_stated'
              ? ` — the date the agency stated (${clock.dueDate.slice(0, 10)}).`
              : ` — ${clock.dueDate.slice(0, 10)}, from ${clock.window.citation ?? 'the governed response window'}.`) +
            (clock.window.consequence ? ` ${clock.window.consequence}` : '')
          : `${subject} arrived ${clock.daysSinceReceived} day(s) ago and has no recorded response. ` +
            `No response date is on record and no regulation fixes a window for this class, so nothing here is overdue — ` +
            `the date the agency set is what governs.` +
            (clock.window.consequence ? ` ${clock.window.consequence}` : '');

      alerts.push({
        id: `correspondence-no-response:${r.id}`,
        kind: 'correspondence.no_response',
        severity: clock.severity,
        organizationId,
        message,
        suggestedSurface: 'pre-sub',
        detail: {
          correspondenceId: r.id,
          projectId: r.project_id,
          submissionId: r.submission_id,
          communicationType: r.communication_type,
          submissionType: r.submission_type ?? null,
          status: r.status,
          receivedAt: r.received_at,
          urgency: r.urgency,
          clock,
        },
      });
    }
  } catch (err) {
    /* Not swallowed as "nothing to report": a read that could not run is said
       so, which is the distinction the previous version lost. */
    logger.warn('correspondence response clock could not be read', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Evidence-sufficiency verdict insufficient + target date < 60d ──
  try {
    const { rows } = await client.query(
      `SELECT DISTINCT ON (a.program_id)
              a.id, a.program_id, a.verdict, a.overall_score, a.created_at,
              p.code AS program_code, p.target_submission_date
       FROM evidence_sufficiency_assessments a
       JOIN regulatory_programs p ON p.id::text = a.program_id
       WHERE p.organization_id = $1
         AND p.target_submission_date IS NOT NULL
         AND p.target_submission_date < NOW() + INTERVAL '${TARGET_SUBMISSION_WARN_DAYS} days'
       ORDER BY a.program_id, a.created_at DESC`,
      [organizationId],
    );
    for (const r of rows) {
      if (r.verdict !== 'insufficient') continue;
      const daysToTarget = daysBetween(now, new Date(r.target_submission_date));
      alerts.push({
        id: `evidence-low-near-target:${r.program_id}`,
        kind: 'evidence_sufficiency.low_near_target',
        severity: daysToTarget < 30 ? 'critical' : 'warn',
        organizationId,
        programId: r.program_id,
        message:
          `${r.program_code}: evidence sufficiency is insufficient (score ${r.overall_score}) ` +
          `and target submission date is in ${daysToTarget} days.`,
        suggestedTool: 'evidence_sufficiency.assess',
        suggestedSurface: 'k510',
        detail: {
          assessmentId: r.id,
          verdict: r.verdict,
          overallScore: r.overall_score,
          daysToTarget,
        },
      });
    }
  } catch {
    // fail-soft
  }

  // ── Program target_submission_date approaching ──
  try {
    const { rows } = await client.query(
      `SELECT id::text AS program_id, code, name, target_submission_date, status
       FROM regulatory_programs
       WHERE organization_id = $1
         AND target_submission_date IS NOT NULL
         AND status NOT IN ('submitted', 'approved', 'rejected', 'archived')
         AND target_submission_date < NOW() + INTERVAL '${TARGET_SUBMISSION_WARN_DAYS} days'
       ORDER BY target_submission_date ASC`,
      [organizationId],
    );
    for (const r of rows) {
      const days = daysBetween(now, new Date(r.target_submission_date));
      const severity: MdxAlertSeverity =
        days <= TARGET_SUBMISSION_CRITICAL_DAYS ? 'critical' : 'warn';
      alerts.push({
        id: `target-submission:${r.program_id}`,
        kind: 'program.target_submission_approaching',
        severity,
        organizationId,
        programId: r.program_id,
        message:
          `Program ${r.code} (${r.name}) is ${days} day${days === 1 ? '' : 's'} from its target ` +
          `submission date; current status "${r.status}".`,
        suggestedSurface: 'k510',
        detail: {
          targetSubmissionDate: r.target_submission_date,
          status: r.status,
          daysToTarget: days,
        },
      });
    }
  } catch {
    // fail-soft
  }

  return {
    organizationId,
    generatedAt: now.toISOString(),
    alerts: alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
  };
}

function severityRank(s: MdxAlertSeverity): number {
  return s === 'critical' ? 3 : s === 'warn' ? 2 : 1;
}
