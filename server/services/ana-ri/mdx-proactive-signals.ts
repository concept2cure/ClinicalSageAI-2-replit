/**
 * MDX proactive signals — table-aware alerts AnA surfaces without being asked.
 *
 * Peer (not replacement) of `server/services/intelligence/proactive-commitment-engine.ts`,
 * which is generic ProjectCommitment-shaped. This module reads the
 * MDX-specific tables (q_submissions, q_sub_commitments, cerv2_510k_sections,
 * regulatory_correspondence, regulatory_programs, evidence_sufficiency_assessments)
 * and emits MDX-shaped alerts.
 *
 * Output shape mirrors `ProactiveCheckResult` so a future caller can union
 * MDX signals with the existing engine's output.
 *
 * All queries are tenant-scoped via `regulatory_programs.organization_id`.
 * Read-only. Never mutates.
 */

import type { Pool, PoolClient } from 'pg';

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
const CORRESPONDENCE_NO_RESPONSE_DAYS = 14;

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

  // ── Ingested correspondence with no response yet ──
  try {
    const { rows } = await client.query(
      `SELECT c.id, c.subject, c.received_at, c.due_date, c.urgency, c.project_id,
              c.submission_id
       FROM correspondences c
       WHERE c.organization_id = $1
         AND COALESCE(c.response_status, 'open') = 'open'
         AND c.received_at < NOW() - INTERVAL '${CORRESPONDENCE_NO_RESPONSE_DAYS} days'
       ORDER BY c.received_at ASC
       LIMIT 25`,
      [organizationId],
    );
    for (const r of rows) {
      const days = daysBetween(new Date(r.received_at), now);
      const severity: MdxAlertSeverity =
        r.urgency === 'critical' ? 'critical' : r.urgency === 'high' ? 'warn' : 'info';
      alerts.push({
        id: `correspondence-no-response:${r.id}`,
        kind: 'correspondence.no_response',
        severity,
        organizationId,
        message:
          `FDA correspondence "${r.subject}" was received ${days} days ago and has no ` +
          `recorded response yet${r.due_date ? ` (due ${new Date(r.due_date).toISOString().slice(0, 10)})` : ''}.`,
        suggestedSurface: 'pre-sub',
        detail: {
          correspondenceId: r.id,
          projectId: r.project_id,
          submissionId: r.submission_id,
          receivedAt: r.received_at,
          dueDate: r.due_date,
          urgency: r.urgency,
          daysSinceReceived: days,
        },
      });
    }
  } catch {
    // fail-soft (correspondences table may have a different name in some tenants)
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
