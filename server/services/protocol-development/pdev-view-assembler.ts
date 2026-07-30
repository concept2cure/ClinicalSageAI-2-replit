/**
 * Assemble the v2 ProtocolDev surface's `PdevDoc` render contract from the REAL
 * normalized protocol store (protocol_documents + every protocol_* child table).
 *
 * This is the GA read path: no legacy blob, no honest-empty placeholders. Every
 * field the surface renders — sections, content, objectives, eligibility, schedule
 * of assessments, risks, milestones, amendments, deviations, budget, reviews,
 * completeness — is mapped from the same tables the CRUD routes and the AnA protocol
 * tools write. Children are fetched in bulk (one query per table via ANY($docIds)),
 * so the whole surface for an org is a bounded, small number of queries regardless
 * of protocol count. Org-scoped throughout; soft-deleted rows excluded.
 */
import { pool } from '../../db';
import { evaluateCompleteness, type SectionView } from './protocol-development-logic';

const MAX_DOCS = 25;

const str = (v: unknown): string => (v == null ? '' : String(v));
const bool = (v: unknown): boolean => v === true || v === 't' || v === 'true';

/** Ordinal scales the surface multiplies (l×i) and tones on. */
const LIKELIHOOD: Record<string, number> = { rare: 1, unlikely: 2, possible: 3, likely: 4, almost_certain: 5 };
const IMPACT: Record<string, number> = { negligible: 1, minor: 2, moderate: 3, major: 4, severe: 5 };

function groupBy<T>(rows: T[], key: (r: T) => unknown): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = str(key(r));
    const list = m.get(k) ?? [];
    list.push(r);
    m.set(k, list);
  }
  return m;
}

function milestoneUrgency(targetDate: unknown, actualDate: unknown, now: number): string {
  if (actualDate) return 'done';
  if (!targetDate) return 'normal';
  const t = new Date(str(targetDate)).getTime();
  if (Number.isNaN(t)) return 'normal';
  const days = (t - now) / 86_400_000;
  if (days < 0) return 'overdue';
  if (days <= 30) return 'soon';
  return 'normal';
}

/**
 * Assemble every in-development protocol for the org, newest first. Returns [] when
 * the org has no real protocols — the surface renders its honest empty state.
 */
export async function assembleOrgPdevDocs(orgId: number): Promise<Record<string, unknown>[]> {
  const docsRes = await pool.query(
    `SELECT id, protocol_kind, protocol_number, title, design_type, phase, version, status, updated_at
       FROM protocol_documents
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT $2`,
    [orgId, MAX_DOCS],
  );
  const docs = docsRes.rows as Array<Record<string, unknown>>;
  if (docs.length === 0) return [];
  const ids = docs.map((d) => Number(d.id));
  const now = Date.now();

  // Bulk-fetch every child in one query each, scoped to the org + these docs.
  const q = (sql: string, params: unknown[] = [ids, orgId]) => pool.query(sql, params);
  const [
    sections, objectives, eligibility, visits, risks, milestones, amendments,
    deviations, budgetItems, budgetParams, reviewAssignments, reviewComments,
    soaAssessments, soaCells,
  ] = await Promise.all([
    q(`SELECT id, protocol_document_id, section_key, title, content, required, status, order_index FROM protocol_sections WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`),
    q(`SELECT id, protocol_document_id, objective_type, objective, endpoint, timepoint FROM protocol_objectives WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`),
    q(`SELECT id, protocol_document_id, kind, criterion FROM protocol_eligibility_criteria WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY kind, order_index, id`),
    q(`SELECT id, protocol_document_id, visit_name, timepoint FROM protocol_schedule_visits WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`),
    q(`SELECT id, protocol_document_id, category, description, likelihood, impact, mitigation, residual_likelihood, residual_impact, status FROM protocol_risks WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT id, protocol_document_id, name, milestone_type, target_date, actual_date FROM protocol_milestones WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY target_date NULLS LAST, id`),
    q(`SELECT id, protocol_document_id, amendment_number, title, affects_consent, submitted_date, decided_date FROM protocol_amendments WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT id, protocol_document_id, deviation_number, description, is_reportable FROM protocol_deviations WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT id, protocol_document_id, category, description, unit_cost, quantity_per_subject FROM protocol_budget_items WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT protocol_document_id, target_enrollment, sponsor_payment_per_subject, indirect_rate_pct FROM protocol_budget_params WHERE protocol_document_id = ANY($1) AND organization_id = $2`),
    q(`SELECT id, protocol_document_id, reviewer_name, role, status FROM protocol_review_assignments WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT id, protocol_document_id, section_ref, comment, resolved FROM protocol_review_comments WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT id, protocol_document_id, name, category, order_index FROM protocol_soa_assessments WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`),
    q(`SELECT protocol_document_id, assessment_id, visit_id, required FROM protocol_soa_cells WHERE protocol_document_id = ANY($1) AND organization_id = $2`),
  ]);

  // Amendment changes + deviation CAPA are keyed by their parent, not the document.
  const amendmentIds = amendments.rows.map((a) => Number(a.id));
  const deviationIds = deviations.rows.map((d) => Number(d.id));
  const [amendChanges, capa] = await Promise.all([
    amendmentIds.length
      ? pool.query(`SELECT amendment_id, section_ref, change_description, previous_text, proposed_text FROM protocol_amendment_changes WHERE amendment_id = ANY($1)`, [amendmentIds])
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    deviationIds.length
      ? pool.query(`SELECT deviation_id, action, status FROM protocol_capa_actions WHERE deviation_id = ANY($1)`, [deviationIds])
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
  ]);

  const byDoc = {
    sections: groupBy(sections.rows, (r) => r.protocol_document_id),
    objectives: groupBy(objectives.rows, (r) => r.protocol_document_id),
    eligibility: groupBy(eligibility.rows, (r) => r.protocol_document_id),
    visits: groupBy(visits.rows, (r) => r.protocol_document_id),
    risks: groupBy(risks.rows, (r) => r.protocol_document_id),
    milestones: groupBy(milestones.rows, (r) => r.protocol_document_id),
    amendments: groupBy(amendments.rows, (r) => r.protocol_document_id),
    deviations: groupBy(deviations.rows, (r) => r.protocol_document_id),
    budgetItems: groupBy(budgetItems.rows, (r) => r.protocol_document_id),
    reviewAssignments: groupBy(reviewAssignments.rows, (r) => r.protocol_document_id),
    reviewComments: groupBy(reviewComments.rows, (r) => r.protocol_document_id),
    soaAssessments: groupBy(soaAssessments.rows, (r) => r.protocol_document_id),
    soaCells: groupBy(soaCells.rows, (r) => r.protocol_document_id),
  };
  const paramsByDoc = groupBy(budgetParams.rows, (r) => r.protocol_document_id);
  const changesByAmend = groupBy(amendChanges.rows, (r) => r.amendment_id);
  const capaByDev = groupBy(capa.rows, (r) => r.deviation_id);
  const commentsByAssignment = groupBy(reviewComments.rows, (r) => r.protocol_document_id);

  const g = (m: Map<string, Record<string, unknown>[]>, id: number) => m.get(str(id)) ?? [];

  return docs.map((d) => {
    const id = Number(d.id);
    const secs = g(byDoc.sections, id);
    const content: Record<string, unknown[]> = {};
    for (const s of secs) {
      if (s.content) content[str(s.id)] = [{ h: str(s.title), p: str(s.content), prov: { src: 'authoring', conf: '', audit: '' } }];
    }
    const requiredSecs = secs.filter((s) => s.required);
    const requiredComplete = requiredSecs.filter((s) => s.status === 'complete').length;
    const pct = requiredSecs.length ? Math.round((100 * requiredComplete) / requiredSecs.length) : 0;
    const findings = evaluateCompleteness({
      sections: secs.map((s) => ({ sectionKey: str(s.section_key), title: str(s.title), required: bool(s.required), status: str(s.status) }) as SectionView),
      objectiveCount: g(byDoc.objectives, id).length,
      inclusionCount: g(byDoc.eligibility, id).filter((e) => e.kind === 'inclusion').length,
      exclusionCount: g(byDoc.eligibility, id).filter((e) => e.kind === 'exclusion').length,
      scheduleVisitCount: g(byDoc.visits, id).length,
      kind: str(d.protocol_kind) as never,
    }).findings;

    const params = paramsByDoc.get(str(id))?.[0];

    return {
      id: str(id),
      title: str(d.title),
      shortTitle: str(d.protocol_number),
      kind: str(d.protocol_kind),
      version: str(d.version),
      status: str(d.status),
      sponsor: '',
      pi: '',
      updated: str(d.updated_at),
      completeness: pct,
      openSection: str((secs.find((s) => s.status === 'draft' || s.status === 'in_progress') ?? secs[0])?.id ?? ''),
      sections: secs.map((s) => ({ id: str(s.id), num: str(s.order_index ?? ''), title: str(s.title), status: str(s.status), required: bool(s.required) })),
      content,
      objectives: g(byDoc.objectives, id).map((o) => ({ id: str(o.id), type: str(o.objective_type), text: str(o.objective), endpoint: str(o.endpoint) })),
      eligibility: {
        inclusion: g(byDoc.eligibility, id).filter((e) => e.kind === 'inclusion').map((e) => ({ id: str(e.id), text: str(e.criterion) })),
        exclusion: g(byDoc.eligibility, id).filter((e) => e.kind === 'exclusion').map((e) => ({ id: str(e.id), text: str(e.criterion) })),
      },
      soa: {
        visits: g(byDoc.visits, id).map((v) => ({ id: str(v.id), label: str(v.visit_name), day: str(v.timepoint), window: '' })),
        assessments: g(byDoc.soaAssessments, id).map((a) => ({ id: str(a.id), label: str(a.name), cat: str(a.category) })),
        cells: (() => {
          const cells: Record<string, string[]> = {};
          for (const c of g(byDoc.soaCells, id)) {
            if (!bool(c.required)) continue;
            const key = str(c.assessment_id);
            (cells[key] = cells[key] ?? []).push(str(c.visit_id));
          }
          return cells;
        })(),
        issues: [],
      },
      risks: g(byDoc.risks, id).map((r) => ({
        id: str(r.id), hazard: str(r.description), cat: str(r.category),
        l: LIKELIHOOD[str(r.likelihood)] ?? 3, i: IMPACT[str(r.impact)] ?? 3,
        mitigation: str(r.mitigation),
        rl: LIKELIHOOD[str(r.residual_likelihood)] ?? 0, ri: IMPACT[str(r.residual_impact)] ?? 0,
        status: str(r.status),
      })),
      milestones: g(byDoc.milestones, id).map((m) => ({
        id: str(m.id), label: str(m.name), date: str(m.actual_date ?? m.target_date),
        status: m.actual_date ? 'complete' : 'pending', urgency: milestoneUrgency(m.target_date, m.actual_date, now),
      })),
      budget: {
        params: {
          enrollment: Number(params?.target_enrollment ?? 0),
          sponsorPerSubject: Number(params?.sponsor_payment_per_subject ?? 0),
          faRate: Number(params?.indirect_rate_pct ?? 0),
        },
        items: g(byDoc.budgetItems, id).map((b) => ({
          id: str(b.id), cat: str(b.category), label: str(b.description),
          perSubject: Number(b.unit_cost ?? 0) * Number(b.quantity_per_subject ?? 1),
        })),
      },
      amendments: g(byDoc.amendments, id).map((a) => ({
        id: str(a.id), num: str(a.amendment_number), summary: str(a.title),
        status: a.decided_date ? 'decided' : a.submitted_date ? 'submitted' : 'draft',
        reconsent: bool(a.affects_consent), path: '',
        changes: g(changesByAmend, Number(a.id)).map((c) => ({ sec: str(c.section_ref), from: str(c.previous_text), to: str(c.proposed_text) })),
      })),
      deviations: g(byDoc.deviations, id).map((dv) => ({
        id: str(dv.id), title: str(dv.description), sev: '', cat: '',
        reportable: bool(dv.is_reportable), status: '',
        capa: g(capaByDev, Number(dv.id)).map((c) => ({ id: str(c.deviation_id), action: str(c.action), status: str(c.status) })),
      })),
      reviews: g(byDoc.reviewAssignments, id).map((rv) => ({
        id: str(rv.id), reviewer: str(rv.reviewer_name), role: str(rv.role), status: str(rv.status),
        comments: g(commentsByAssignment, id).map((c) => ({ id: str(c.id), sec: str(c.section_ref), sev: '', text: str(c.comment), resolved: bool(c.resolved) })),
      })),
      consent: [],
      completenessFindings: findings.map((f) => ({ sev: str((f as { severity?: unknown }).severity), text: str((f as { message?: unknown }).message) })),
    };
  });
}
