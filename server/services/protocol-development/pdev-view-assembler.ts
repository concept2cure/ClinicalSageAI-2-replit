/**
 * Assemble the v2 ProtocolDev surface's `PdevDoc` render contract from the REAL
 * normalized protocol store (protocol_documents + every protocol_* child table).
 *
 * This is the GA read path: no legacy blob, no honest-empty placeholders. Every
 * field the surface renders — sections, content, objectives, eligibility, schedule
 * of assessments (with the SoA engine's validation as `issues`), risks, milestones,
 * amendments, deviations, budget (with the budget engine's summary), reviews,
 * consent (the latest linked consent form's elements), the study team, the
 * cover-page sponsor / principal investigator, completeness — is mapped from the
 * same tables the CRUD routes and the AnA protocol tools write. Children are fetched in bulk (one query per table via ANY($docIds)),
 * so the whole surface for an org is a bounded, small number of queries regardless
 * of protocol count. Org-scoped throughout; soft-deleted rows excluded.
 */
import { pool } from '../../db';
import { evaluateCompleteness, type SectionView } from './protocol-development-logic';
import { buildSoaMatrix, validateSoa } from '../protocol-soa/protocol-soa-logic';
import { computeProtocolBudget } from '../protocol-budget/protocol-budget-logic';
import { rowsToStudyDesign } from '../study-design/study-design-repository';
import { validateDesign } from '../study-design/design-validation';

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

/** Review assignments with their comments. Extracted for the lint budget. */
function mapReviews(
  rows: Record<string, unknown>[],
  comments: Record<string, unknown>[],
): unknown[] {
  const mapped = comments.map((c) => ({
    id: str(c.id), sec: str(c.section_ref), sev: str(c.severity), text: str(c.comment), resolved: bool(c.resolved),
  }));
  return rows.map((rv) => ({
    id: str(rv.id), reviewer: str(rv.reviewer_name), role: str(rv.role), status: str(rv.status),
    disposition: str(rv.disposition), dueDate: rv.due_date ? String(rv.due_date).slice(0, 10) : '',
    comments: mapped,
  }));
}

/** The cover page's principal investigator: the column when the protocol
 *  carries one, else the team member holding that role. */
function coverPagePi(d: Record<string, unknown>, teamRows: Record<string, unknown>[]): string {
  const stated = str(d.principal_investigator);
  if (stated) return stated;
  return str(teamRows.find((m) => m.role === 'principal_investigator')?.member_name);
}

/** The section the author lands on: the first unfinished one, else the first. */
function firstOpenSectionId(secs: Record<string, unknown>[]): string {
  const open = secs.find((s) => s.status === 'draft' || s.status === 'in_progress');
  return str((open ?? secs[0])?.id ?? '');
}

/**
 * Run the SoA engine over one document's rows — the same engine
 * /api/protocol-soa serves, so the grid and its findings are one verdict.
 * Cells are filtered to live visits and assessments first: a cell orphaned by
 * a deleted row must not reach the matrix.
 */
function runSoaEngine(
  visits: Record<string, unknown>[],
  assessments: Record<string, unknown>[],
  cells: Record<string, unknown>[],
): {
  liveVisits: Record<string, unknown>[];
  liveAssessments: Record<string, unknown>[];
  liveCells: Record<string, unknown>[];
  soaValidation: { findings: Array<{ severity: string; message: string }> };
} {
  const visitIds = new Set(visits.map((v) => str(v.id)));
  const assessmentIds = new Set(assessments.map((a) => str(a.id)));
  const liveCells = cells.filter((c) => visitIds.has(str(c.visit_id)) && assessmentIds.has(str(c.assessment_id)));
  const matrix = buildSoaMatrix(
    assessments.map((a) => ({ id: Number(a.id), name: str(a.name), category: str(a.category), orderIndex: Number(a.order_index ?? 0) })),
    visits.map((v, idx) => ({ id: Number(v.id), visitName: str(v.visit_name), timepoint: v.timepoint == null ? null : str(v.timepoint), orderIndex: idx })),
    liveCells.map((c) => ({ assessmentId: Number(c.assessment_id), visitId: Number(c.visit_id), required: bool(c.required) })),
  );
  const soaValidation = validateSoa(matrix, assessments.map((a) => ({ id: Number(a.id), name: str(a.name), category: str(a.category) })));
  return { liveVisits: visits, liveAssessments: assessments, liveCells, soaValidation };
}

/** The schedule of assessments and the SoA engine's findings. Extracted so the
 *  per-document mapper stays inside the repo's lint budget. */
function mapSoa(
  liveVisits: Record<string, unknown>[],
  liveAssessments: Record<string, unknown>[],
  liveCells: Record<string, unknown>[],
  soaValidation: { findings: Array<{ severity: string; message: string }> },
): unknown {
  const cells: Record<string, string[]> = {};
  for (const c of liveCells) {
    if (!bool(c.required)) continue;
    const key = str(c.assessment_id);
    (cells[key] = cells[key] ?? []).push(str(c.visit_id));
  }
  return {
    visits: liveVisits.map((v) => ({ id: str(v.id), label: str(v.visit_name), day: str(v.timepoint), window: '' })),
    assessments: liveAssessments.map((a) => ({ id: str(a.id), label: str(a.name), cat: str(a.category) })),
    cells,
    issues: soaValidation.findings.map((f) => ({ sev: f.severity, text: f.message })),
  };
}

/** The budget inputs and the budget engine's summary. Extracted for the same
 *  reason; every derived figure comes from `summary`, never from here. */
function mapBudget(
  params: Record<string, unknown> | null | undefined,
  budgetRows: Record<string, unknown>[],
  budgetSummary: unknown,
): unknown {
  return {
    params: params
      ? {
          enrollment: Number(params.target_enrollment ?? 0),
          sponsorPerSubject: params.sponsor_payment_per_subject == null ? null : Number(params.sponsor_payment_per_subject),
          /* Percent, as stored (28 = 28 %). */
          faRate: params.indirect_rate_pct == null ? null : Number(params.indirect_rate_pct),
        }
      : null,
    items: budgetRows.map((b) => ({
      id: str(b.id), cat: str(b.category), label: str(b.description),
      perSubject: Number(b.unit_cost ?? 0) * Number(b.quantity_per_subject ?? 1),
    })),
    summary: budgetSummary,
  };
}

/** Amendments with their change rows. Extracted so the per-document mapper
 *  stays under the size the repo's lint budget allows. */
function mapAmendments(
  rows: Record<string, unknown>[],
  changesByAmend: Map<string, Record<string, unknown>[]>,
): unknown[] {
  const at = (id: number) => changesByAmend.get(str(id)) ?? [];
  return rows.map((a) => ({
    id: str(a.id), num: str(a.amendment_number), summary: str(a.title),
    status: a.decided_date ? 'decided' : a.submitted_date ? 'submitted' : 'draft',
    reconsent: bool(a.affects_consent), path: '',
    changes: at(Number(a.id)).map((c) => ({ sec: str(c.section_ref), from: str(c.previous_text), to: str(c.proposed_text) })),
  }));
}

/** Deviations with their CAPA rows. Extracted for the same reason. */
function mapDeviations(
  rows: Record<string, unknown>[],
  capaByDev: Map<string, Record<string, unknown>[]>,
): unknown[] {
  const at = (id: number) => capaByDev.get(str(id)) ?? [];
  return rows.map((dv) => ({
    id: str(dv.id), title: str(dv.description), sev: str(dv.severity), cat: str(dv.category),
    reportable: bool(dv.is_reportable), status: str(dv.status),
    capa: at(Number(dv.id)).map((c) => ({ id: str(c.deviation_id), action: str(c.action), status: str(c.status) })),
  }));
}

/* ── The bound study design, and the design gates' findings ──────────────── */

/**
 * The design-as-data spine's verdict on a protocol that names a design.
 *
 * docs/design/PROTOCOL_DESIGN_CONVERGENCE.md step 1c: nothing here decides
 * anything. The design object is read back verbatim from
 * `cdisc_prm_studies.metadata` (the same round-trip `loadStudyDesign` does)
 * and handed to `validateDesign`, which is the SAME ICH E9 / E9(R1) / E10 /
 * E3 and ICH M11 gate engine `/api/study-design` serves. The mapping below is
 * a rename of that report's fields onto the `sev`/`text` shape the protocol
 * surface's other registers already use — no severity is re-derived, no
 * finding is invented, and no finding is filtered out.
 */
export interface PdevStudyDesignFinding {
  code: string; section: string; sev: string; title: string; text: string;
  standard: string; endpoint: string; fix: string;
}

export interface PdevStudyDesignView {
  studyId: string;
  /** False when the link names a design this tenant cannot read. Never a
   *  silent empty result: the surface says the link is unresolved. */
  resolved: boolean;
  title: string;
  phase: string;
  indication: string;
  status: string;
  linkedAt: string;
  riskLevel: string;
  canAdvance: boolean;
  blocksApproval: boolean;
  counts: { critical: number; major: number; minor: number; info: number };
  summary: string;
  standardsChecked: string[];
  findings: PdevStudyDesignFinding[];
}

/**
 * The bound design for one protocol row, or null when it names none.
 *
 * Extracted from the per-document mapper for the same reason mapSoa/mapBudget
 * are: the mapper is at the repo's complexity budget and a suppression there
 * would be the wrong trade.
 */
function resolveStudyDesign(
  d: Record<string, unknown>,
  bound: Map<string, PdevStudyDesignView>,
): PdevStudyDesignView | null {
  const studyId = str(d.study_design_id);
  if (!studyId) return null;
  const linkedAt = d.study_design_linked_at ? new Date(String(d.study_design_linked_at)).toISOString() : '';
  return { ...(bound.get(studyId) ?? unresolvedDesign(studyId, linkedAt)), linkedAt };
}

/** The unresolved view: the link exists, the design does not (for this tenant). */
function unresolvedDesign(studyId: string, linkedAt: string): PdevStudyDesignView {
  return {
    studyId, resolved: false, title: '', phase: '', indication: '', status: '', linkedAt,
    riskLevel: '', canAdvance: false, blocksApproval: false,
    counts: { critical: 0, major: 0, minor: 0, info: 0 },
    summary: '', standardsChecked: [], findings: [],
  };
}

/**
 * Load every design named by this org's protocols, tenant-scoped, and run the
 * gate engine over each. One query for the whole page, keyed by study id.
 */
async function loadBoundDesigns(
  orgId: number,
  studyIds: string[],
): Promise<Map<string, PdevStudyDesignView>> {
  const out = new Map<string, PdevStudyDesignView>();
  if (studyIds.length === 0) return out;
  const res = await pool.query(
    `SELECT study_id, protocol_title, study_phase, indication, protocol_status, metadata
       FROM cdisc_prm_studies
      WHERE tenant_id = $1 AND study_id = ANY($2)`,
    [orgId, studyIds],
  );
  for (const row of res.rows as Array<Record<string, unknown>>) {
    const design = rowsToStudyDesign(row);
    if (!design) continue;
    const v = validateDesign(design);
    out.set(str(row.study_id), {
      studyId: str(row.study_id),
      resolved: true,
      title: str(row.protocol_title),
      phase: str(row.study_phase),
      indication: str(row.indication),
      status: str(row.protocol_status),
      linkedAt: '',
      riskLevel: v.riskLevel,
      canAdvance: v.canAdvance,
      blocksApproval: v.blocksApproval,
      counts: v.counts,
      summary: v.summary,
      standardsChecked: v.standardsChecked,
      findings: v.findings.map((f) => ({
        code: f.code, section: f.section, sev: f.severity, title: f.title, text: f.detail,
        standard: str(f.standard), endpoint: str(f.endpointName), fix: str(f.suggestedFix),
      })),
    });
  }
  return out;
}

/**
 * Assemble every in-development protocol for the org, newest first. Returns [] when
 * the org has no real protocols — the surface renders its honest empty state.
 */
export async function assembleOrgPdevDocs(orgId: number): Promise<Record<string, unknown>[]> {
  const docsRes = await pool.query(
    `SELECT id, protocol_kind, protocol_number, title, design_type, phase, version, status, updated_at, sponsor, principal_investigator,
            study_design_id, study_design_linked_at
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
    soaAssessments, soaCells, team, consentForms,
  ] = await Promise.all([
    q(`SELECT id, protocol_document_id, section_key, title, content, required, status, order_index, updated_at FROM protocol_sections WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`),
    q(`SELECT id, protocol_document_id, objective_type, objective, endpoint, timepoint FROM protocol_objectives WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`),
    q(`SELECT id, protocol_document_id, kind, criterion FROM protocol_eligibility_criteria WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY kind, order_index, id`),
    q(`SELECT id, protocol_document_id, visit_name, timepoint FROM protocol_schedule_visits WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`),
    q(`SELECT id, protocol_document_id, category, description, likelihood, impact, mitigation, residual_likelihood, residual_impact, status, owner FROM protocol_risks WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT id, protocol_document_id, name, milestone_type, target_date, actual_date FROM protocol_milestones WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY target_date NULLS LAST, id`),
    q(`SELECT id, protocol_document_id, amendment_number, title, affects_consent, submitted_date, decided_date FROM protocol_amendments WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    /* severity / category / status are NOT NULL with CHECK constraints on this
       table and were simply never selected, then hard-blanked below. A monitor
       could not tell a CRITICAL deviation from a MINOR one — which is the 3-day
       versus 10-day reporting distinction — and open rendered identically to
       closed. */
    q(`SELECT id, protocol_document_id, deviation_number, description, is_reportable, severity, category, status FROM protocol_deviations WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT id, protocol_document_id, category, description, unit_cost, quantity_per_subject FROM protocol_budget_items WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT protocol_document_id, target_enrollment, sponsor_payment_per_subject, indirect_rate_pct FROM protocol_budget_params WHERE protocol_document_id = ANY($1) AND organization_id = $2`),
    q(`SELECT id, protocol_document_id, reviewer_name, role, status, disposition, due_date FROM protocol_review_assignments WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    /* Same shape: `severity` exists (blocking/major/minor/info) and was blanked,
       so the Review header was structurally incapable of reporting anything but
       "0 blocking open" and every per-comment badge rendered empty. */
    q(`SELECT id, protocol_document_id, section_ref, comment, resolved, severity FROM protocol_review_comments WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT id, protocol_document_id, name, category, order_index FROM protocol_soa_assessments WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`),
    q(`SELECT protocol_document_id, assessment_id, visit_id, required FROM protocol_soa_cells WHERE protocol_document_id = ANY($1) AND organization_id = $2`),
    /* The study team was never read here: the surface's header printed `pi`
       as '' and the roster (six seeded members on the demo protocol) was
       invisible. */
    q(`SELECT id, protocol_document_id, member_name, role, responsibilities FROM protocol_team_members WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY CASE role WHEN 'principal_investigator' THEN 0 ELSE 1 END, id`),
    /* Consent forms soft-link to the protocol (consent_forms.protocol_document_id);
       the write path is /api/protocol-consent. `consent: []` used to be
       hard-coded here, so the tab read "0 of 0" whatever had been authored. */
    q(`SELECT id, protocol_document_id, title, version, status, updated_at FROM consent_forms WHERE protocol_document_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC`),
  ]);

  // Amendment changes + deviation CAPA are keyed by their parent, not the document.
  const amendmentIds = amendments.rows.map((a) => Number(a.id));
  const deviationIds = deviations.rows.map((d) => Number(d.id));
  const consentFormIds = consentForms.rows.map((f) => Number(f.id));
  const [amendChanges, capa, consentElements] = await Promise.all([
    amendmentIds.length
      ? pool.query(`SELECT amendment_id, section_ref, change_description, previous_text, proposed_text FROM protocol_amendment_changes WHERE amendment_id = ANY($1)`, [amendmentIds])
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    deviationIds.length
      ? pool.query(`SELECT deviation_id, action, status FROM protocol_capa_actions WHERE deviation_id = ANY($1)`, [deviationIds])
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    consentFormIds.length
      ? pool.query(`SELECT id, consent_form_id, element_key, title, required, present, order_index FROM consent_form_elements WHERE consent_form_id = ANY($1) AND organization_id = $2 ORDER BY order_index, id`, [consentFormIds, orgId])
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
    team: groupBy(team.rows, (r) => r.protocol_document_id),
    consentForms: groupBy(consentForms.rows, (r) => r.protocol_document_id),
  };
  /* The design-as-data spine, for the protocols that name one. Tenant-scoped,
     and the verdict is validateDesign()'s — see loadBoundDesigns. */
  const boundDesigns = await loadBoundDesigns(
    orgId,
    Array.from(new Set(docs.map((d) => str(d.study_design_id)).filter(Boolean))),
  );

  const elementsByForm = groupBy(consentElements.rows, (r) => r.consent_form_id);
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
    const teamRows = g(byDoc.team, id);

    /* Schedule of assessments: cells are read only for LIVE visits and
       assessments (a removed visit's cells stay as rows), and the issues are
       the same deterministic validation /api/protocol-soa/documents/:id/matrix
       reports — `issues: []` used to be hard-coded, which is not a verdict. */
    const { liveVisits, liveAssessments, liveCells, soaValidation } = runSoaEngine(
      g(byDoc.visits, id),
      g(byDoc.soaAssessments, id),
      g(byDoc.soaCells, id),
    );

    /* Budget: the verdict is the budget engine's (computeProtocolBudget), the
       same one /api/protocol-budget/documents/:id/summary returns. With no
       params row there are no inputs, `params` is null and the surface says
       so; it does not print "Funded" over an enrollment of 0. */
    const budgetRows = g(byDoc.budgetItems, id);
    const budgetSummary = computeProtocolBudget(
      budgetRows.map((b) => ({ category: str(b.category), unitCost: Number(b.unit_cost ?? 0), quantityPerSubject: Number(b.quantity_per_subject ?? 1) })),
      { targetEnrollment: Number(params?.target_enrollment ?? 0), sponsorPaymentPerSubject: params?.sponsor_payment_per_subject == null ? null : Number(params.sponsor_payment_per_subject), indirectRatePct: params?.indirect_rate_pct == null ? null : Number(params.indirect_rate_pct) },
    );

    const latestConsentForm = g(byDoc.consentForms, id)[0];
    const consentEls = latestConsentForm ? g(elementsByForm, Number(latestConsentForm.id)) : [];

    /* The bound study design. `null` — not an empty report — when the protocol
       names no design, so the surface says "no design is bound" rather than
       implying the protocol cleared gates that were never run on it. */
    const studyDesign = resolveStudyDesign(d, boundDesigns);

    return {
      id: str(id),
      title: str(d.title),
      shortTitle: str(d.protocol_number),
      kind: str(d.protocol_kind),
      version: str(d.version),
      status: str(d.status),
      sponsor: str(d.sponsor),
      /* `pi` is kept for one release for readers of the old contract; `team`
         is the roster. The cover-page column wins; a protocol seeded before
         the column existed still names its PI from the roster. */
      pi: coverPagePi(d, teamRows),
      principalInvestigator: str(d.principal_investigator),
      team: teamRows.map((m) => ({ id: str(m.id), name: str(m.member_name), role: str(m.role), responsibilities: str(m.responsibilities) })),
      updated: str(d.updated_at),
      completeness: pct,
      openSection: firstOpenSectionId(secs),
      sections: secs.map((s) => ({ id: str(s.id), num: str(s.order_index ?? ''), title: str(s.title), status: str(s.status), required: bool(s.required), updatedAt: s.updated_at ? new Date(String(s.updated_at)).toISOString() : '' })),
      content,
      objectives: g(byDoc.objectives, id).map((o) => ({ id: str(o.id), type: str(o.objective_type), text: str(o.objective), endpoint: str(o.endpoint) })),
      eligibility: {
        inclusion: g(byDoc.eligibility, id).filter((e) => e.kind === 'inclusion').map((e) => ({ id: str(e.id), text: str(e.criterion) })),
        exclusion: g(byDoc.eligibility, id).filter((e) => e.kind === 'exclusion').map((e) => ({ id: str(e.id), text: str(e.criterion) })),
      },
      soa: mapSoa(liveVisits, liveAssessments, liveCells, soaValidation),
      risks: g(byDoc.risks, id).map((r) => ({
        id: str(r.id), hazard: str(r.description), cat: str(r.category),
        l: LIKELIHOOD[str(r.likelihood)] ?? 3, i: IMPACT[str(r.impact)] ?? 3,
        mitigation: str(r.mitigation),
        rl: LIKELIHOOD[str(r.residual_likelihood)] ?? 0, ri: IMPACT[str(r.residual_impact)] ?? 0,
        status: str(r.status), owner: str(r.owner),
      })),
      milestones: g(byDoc.milestones, id).map((m) => ({
        id: str(m.id), label: str(m.name), date: str(m.actual_date ?? m.target_date),
        status: m.actual_date ? 'complete' : 'pending', urgency: milestoneUrgency(m.target_date, m.actual_date, now),
      })),
      budget: mapBudget(params, budgetRows, budgetSummary),
      amendments: mapAmendments(g(byDoc.amendments, id), changesByAmend),
      deviations: mapDeviations(g(byDoc.deviations, id), capaByDev),
      reviews: mapReviews(g(byDoc.reviewAssignments, id), g(commentsByAssignment, id)),
      consent: consentEls.map((e) => ({ id: str(e.id), el: str(e.title), key: str(e.element_key), required: bool(e.required), present: bool(e.present) })),
      consentForm: latestConsentForm
        ? { id: str(latestConsentForm.id), title: str(latestConsentForm.title), version: str(latestConsentForm.version), status: str(latestConsentForm.status), formsLinked: g(byDoc.consentForms, id).length }
        : null,
      completenessFindings: findings.map((f) => ({ sev: str((f as { severity?: unknown }).severity), text: str((f as { message?: unknown }).message) })),
      studyDesign,
    };
  });
}
