/**
 * launch-demo/packs/lumen-rbm.mjs — LMN-201's risk-based monitoring, so the RBM
 * work area opens on a study with data in it.
 *
 * 2026-11-06: every RBM tab on a seeded LMN-201 read "No monitoring projects",
 * because no pack wrote to it. Everything here goes through the routes the RBM
 * screens use (client/src/concept2cure/v2/surfaces/Rbm.tsx, RbmSurfacesA.tsx,
 * RbmSurfacesB.tsx, RbmIngest.tsx, rbmWrites.tsx), as the signed-in account:
 *
 *   Start risk-based monitoring  POST /api/mdx/rbm-assessments/seed
 *   Add CtQ factor               POST /api/mdx/rbm-risk-items
 *   Approve assessment           POST /api/mdx/rbm-assessments/:id/approve   (second signer only)
 *   New KRI / New QTL            POST /api/mdx/rbm-kris, /api/mdx/rbm-qtls
 *   Load extract…                POST /api/mdx/rbm-metric-ingest            (readings over time)
 *   Scan cohort                  POST /api/mdx/rbm-patient-profiles/score
 *   Generate from RACT           POST /api/mdx/rbm-monitoring-plans/generate (approved RACT)
 *     or a hand-drafted plan     POST /api/mdx/rbm-monitoring-plans         (AnA's draft_monitoring_plan write)
 *   Log signal                   POST /api/mdx/rbm-signals
 *   Triage                       PATCH /api/mdx/rbm-signals/:id
 *   Document investigation       POST /api/mdx/rbm-signals/:id/investigate
 *   Add action / Escalate        POST /api/mdx/rbm-monitoring-actions
 *   Start / Complete             PATCH /api/mdx/rbm-monitoring-actions/:id
 *
 * Idempotent by exact name (assessment title, CtQ factor, KRI name, QTL
 * parameter, extract source reference, plan title, signal title, action
 * description), so a second run creates nothing. A refusal fails the step with
 * the server's answer. Content and its provenance: lumen-rbm-content.mjs.
 *
 * Not reachable from here, and not built: Site risk, Site oversight and the
 * central statistical outlier scan read the site-risk snapshot, which
 * /rbm-site-risk/recompute derives only from Site Intelligence
 * (site_intel.sites). No mounted route writes Site Intelligence, so those
 * views stay empty and the run says so.
 */
import { connectSigner, must } from '../lib.mjs';
import {
  ACTIONS, APPROVAL_REASON, ASSESSMENT_TITLE, CTQ_FACTORS, EXTRACTS, KRIS, PERIOD_DAYS_AGO,
  PLAN, QTLS, SIGNALS, SUBJECTS,
} from './lumen-rbm-content.mjs';

const DAY = 86_400_000;
const dateIn = (days) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const rowsOf = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : []);
const M = '/api/mdx';

/** A read the step cannot do without. */
async function list(api, path, what) {
  return rowsOf(must(await api('GET', path), 200, what));
}

/** The org's assignable members, as the RBM owner pickers list them (useRbmOwners). */
async function ownerIds(api) {
  const people = await list(api, '/api/task-management/assignees', 'read the assignable members');
  const byLabel = new Map(people.map((p) => [String(p.label ?? p.name), Number(p.id)]));
  return (label) => (label && Number.isSafeInteger(byLabel.get(label)) ? byLabel.get(label) : null);
}

/* ───────────────────────── RACT ───────────────────────── */

async function ensureAssessment({ api, run, tally, baseUrl, identity }, program, label) {
  let assessment = null;
  await run.step(`RBM: risk assessment (RACT) on ${label}`, async () => {
    const listed = await list(api, `${M}/rbm-assessments?program_id=${program.id}`, 'list risk assessments');
    const ours = listed.filter((a) => a.title === ASSESSMENT_TITLE).sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    if (ours.length) { assessment = ours[0]; tally.found('rbm-assessment'); return `found #${assessment.id} v${assessment.version} (${assessment.status})`; }
    if (listed.length) {
      // Monitoring was started by hand before the seed ran. Its register is
      // the study's; a second v1 beside it would split the RACT in two.
      assessment = [...listed].sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
      run.note(`RBM: LMN-201 already had risk assessment #${assessment.id} ("${assessment.title}"); the seed built on it rather than starting a second one.`);
      tally.found('rbm-assessment');
      return `found #${assessment.id} (started before the seed)`;
    }
    const j = must(await api('POST', `${M}/rbm-assessments/seed`, { programId: program.id, title: ASSESSMENT_TITLE }), 201, 'start risk-based monitoring (seed the RACT)');
    assessment = j.data ?? j;
    if (!assessment?.id) throw new Error(`the RACT seed answered no assessment id: ${JSON.stringify(j).slice(0, 300)}`);
    tally.created('rbm-assessment');
    return `created #${assessment.id} with ${(assessment.items ?? []).length} default CtQ factors (overall risk ${assessment.overall_risk ?? '—'})`;
  });

  await run.step(`RBM: ${CTQ_FACTORS.length} study-specific CtQ factors on ${label}`, async () => {
    const items = await list(api, `${M}/rbm-risk-items?program_id=${program.id}&assessment_id=${assessment.id}`, 'list CtQ factors');
    const have = new Set(items.map((i) => i.ctq_factor));
    const owner = await ownerIds(api);
    let created = 0;
    const fixed = [];
    for (const f of CTQ_FACTORS) {
      if (have.has(f.factor)) { tally.found('rbm-ctq-factor'); continue; }
      if (assessment.status !== 'draft') { fixed.push(f.factor); continue; }
      must(await api('POST', `${M}/rbm-risk-items`, {
        programId: program.id, assessmentId: assessment.id, category: f.category, ctqFactor: f.factor,
        riskDescription: f.description, likelihood: f.l, impact: f.i, detectability: f.det,
        isCritical: f.l * f.i >= 15, mitigation: f.mitigation, status: f.status, assignedTo: owner(f.owner),
      }), 201, `add CtQ factor "${f.factor}"`);
      tally.created('rbm-ctq-factor');
      created += 1;
    }
    if (fixed.length) run.note(`RBM: the LMN-201 RACT is ${assessment.status}, so its register is fixed; ${fixed.length} demo CtQ factor(s) were not added. Amend it to add them.`);
    return `${created} added, ${CTQ_FACTORS.length - created - fixed.length} already there${fixed.length ? `, ${fixed.length} not added (RACT ${assessment.status})` : ''}`;
  });

  await run.step(`RBM: RACT approval on ${label}`, async () => {
    if (assessment.status === 'active') { tally.found('rbm-approval'); return 'already approved'; }
    // The author may not approve (Part 11 §11.10(d)); only a second identity
    // with a supplied credential signs, as in the other packs.
    // The signer signs in on the server the seed writes to, never a default one.
    const base = baseUrl ?? process.env.DEMO_BASE_URL;
    const signer = base ? await connectSigner({ baseUrl: base, authorEmail: identity?.email }) : null;
    if (!signer) return `not executed — signer credential${base ? '' : ' or target server'} not supplied (OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD); the RACT stays a draft, approval pending`;
    const res = await signer.api('POST', `${M}/rbm-assessments/${assessment.id}/approve`, { reason: APPROVAL_REASON, password: signer.password, meaning: 'approval' });
    if (res.status !== 200) {
      run.note(`RBM: the second signer's approval of RACT #${assessment.id} was refused (HTTP ${res.status}: ${String(res.text).slice(0, 200)}). It stays a draft.`);
      return `not executed — the approval was refused (HTTP ${res.status})`;
    }
    assessment = { ...assessment, ...(res.json?.data ?? {}), status: 'active' };
    tally.created('rbm-approval');
    return `approved by ${signer.email}`;
  });
  return assessment;
}

/* ───────────────────────── KRIs, QTLs and the extracts ───────────────────────── */

async function ensureIndicators({ api, run, tally }, program, assessment, label) {
  await run.step(`RBM: ${KRIS.length} key risk indicators on ${label}`, async () => {
    const have = new Set((await list(api, `${M}/rbm-kris?program_id=${program.id}`, 'list KRIs')).map((k) => k.name));
    let created = 0;
    for (const k of KRIS) {
      if (have.has(k.name)) { tally.found('rbm-kri'); continue; }
      must(await api('POST', `${M}/rbm-kris`, {
        programId: program.id, assessmentId: assessment.id, name: k.name, metricDefinition: k.metric,
        dataSource: k.source, unit: k.unit, direction: k.dir, thresholdAmber: k.amber, thresholdRed: k.red,
      }), 201, `create KRI "${k.name}"`);
      tally.created('rbm-kri');
      created += 1;
    }
    return `${created} created, ${KRIS.length - created} already there`;
  });

  await run.step(`RBM: ${QTLS.length} quality tolerance limits on ${label}`, async () => {
    const have = new Set((await list(api, `${M}/rbm-qtls?program_id=${program.id}`, 'list QTLs')).map((q) => q.parameter));
    let created = 0;
    for (const q of QTLS) {
      if (have.has(q.parameter)) { tally.found('rbm-qtl'); continue; }
      must(await api('POST', `${M}/rbm-qtls`, {
        programId: program.id, parameter: q.parameter, rationale: q.rationale, threshold: q.threshold, secondaryLimit: q.secondaryLimit,
      }), 201, `create QTL "${q.parameter}"`);
      tally.created('rbm-qtl');
      created += 1;
    }
    return `${created} created, ${QTLS.length - created} already there`;
  });

  const cutoffs = PERIOD_DAYS_AGO.map((d) => dateIn(-d));
  await run.step(`RBM: ${EXTRACTS.length * cutoffs.length} monthly metric extracts on ${label}`, async () => {
    const loaded = new Set((await list(api, `${M}/rbm-data-runs?program_id=${program.id}`, 'read the ingestion history'))
      .filter((r) => r.status === 'succeeded' && !r.superseded_at).map((r) => r.source_ref));
    let created = 0, readings = 0, qtlUpdates = 0, subjects = 0, siteRows = 0;
    // Oldest first, so each source's newest run is its latest cutoff.
    for (let p = 0; p < cutoffs.length; p += 1) {
      for (const x of EXTRACTS) {
        const ref = x.ref(p + 1);
        if (loaded.has(ref)) { tally.found('rbm-extract'); continue; }
        const csv = extractCsv(x, p, cutoffs[p]);
        const j = must(await api('POST', `${M}/rbm-metric-ingest`, { programId: program.id, source: x.source, sourceRef: ref, dataCutoff: cutoffs[p], csv }), 201, `load ${ref}`);
        const out = j.data ?? j;
        if (out.status !== 'succeeded' || out.rejected > 0 || out.projection?.unmatched?.length) {
          throw new Error(`${ref} did not land cleanly: ${JSON.stringify({ status: out.status, rejects: out.rejects?.slice(0, 3), unmatched: out.projection?.unmatched })}`);
        }
        readings += out.projection.kriReadings; qtlUpdates += out.projection.qtlUpdates;
        subjects += out.projection.subjectProfiles; siteRows += out.projection.siteObservations;
        tally.created('rbm-extract');
        created += 1;
      }
    }
    return `${created} loaded (${readings} KRI readings, ${qtlUpdates} QTL values, ${subjects} subject profiles, ${siteRows} site observations), ${EXTRACTS.length * cutoffs.length - created} already loaded`;
  });

  await run.step(`RBM: patient cohort scored on ${label}`, async () => {
    const profiles = await list(api, `${M}/rbm-patient-profiles?program_id=${program.id}`, 'list patient profiles');
    if (profiles.length && profiles.every((p) => p.scored_at)) { tally.found('rbm-cohort-score'); return `found ${profiles.length} subjects scored`; }
    const j = must(await api('POST', `${M}/rbm-patient-profiles/score`, { programId: program.id }), 200, 'scan the patient cohort');
    tally.created('rbm-cohort-score');
    return `scored ${j.meta?.cohortSize ?? '?'} subjects — ${j.meta?.flagged ?? 0} flagged, ${j.meta?.review ?? 0} for review`;
  });
}

/** One extract as the Overview's "Load extract…" takes it: header row, then study, site and subject rows. */
function extractCsv(x, p, cutoff) {
  const lines = ['metric_key,scope_level,scope_id,value,numerator,denominator,unit,observed_at'];
  const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const row = (key, scope, id, value, unit) => lines.push([key, scope, id, value, '', '', unit, cutoff].map(cell).join(','));
  for (const k of KRIS.filter((i) => i.extract === x.source)) {
    row(k.name, 'study', '', k.values[p], k.unit);
    for (const [n, vals] of Object.entries(k.bySite ?? {})) if (vals[p] != null) row(k.name, 'site', n, vals[p], k.unit);
  }
  for (const q of QTLS.filter((i) => i.extract === x.source)) row(q.parameter, 'study', '', q.values[p], '%');
  if (x.subjects && p === PERIOD_DAYS_AGO.length - 1) {
    for (const s of SUBJECTS) for (const [key, v] of Object.entries(s.metrics)) row(key, 'subject', s.id, v, '');
  }
  return lines.join('\n') + '\n';
}

/* ───────────────────────── Plan, signals and actions ───────────────────────── */

async function ensurePlan({ api, run, tally }, program, assessment, label) {
  let planId = null;
  await run.step(`RBM: monitoring plan on ${label}`, async () => {
    const plans = await list(api, `${M}/rbm-monitoring-plans?program_id=${program.id}`, 'list monitoring plans');
    const ours = plans.find((p) => p.title === PLAN.title) ?? (plans.length ? plans[0] : null);
    if (ours) { tally.found('rbm-plan'); return `found #${ours.id} v${ours.version} (${ours.status})${ours.title === PLAN.title ? '' : ' — started before the seed'}`; }
    // "Generate from RACT" derives the plan from a signed RACT. Without that
    // signature the plan is drafted by hand, as AnA's draft_monitoring_plan
    // does: a draft, approval pending, which governs the study's actions
    // until a version is approved.
    const viaGenerate = assessment.status === 'active';
    const j = viaGenerate
      ? must(await api('POST', `${M}/rbm-monitoring-plans/generate`, { programId: program.id, title: PLAN.title }), 201, 'generate the monitoring plan from the RACT')
      : must(await api('POST', `${M}/rbm-monitoring-plans`, { programId: program.id, assessmentId: assessment.id, title: PLAN.title, strategy: PLAN.strategy }), 201, 'draft the monitoring plan');
    const plan = j.data ?? j;
    tally.created('rbm-plan');
    return `created #${plan.id} v${plan.version} (${plan.status}, ${viaGenerate ? 'generated from the approved RACT' : 'drafted; the RACT is not yet approved'})`;
  });
  // Actions go to the plan in force, which the board names (governingPlanId).
  const board = must(await api('GET', `/api/mdx-rbm/rbm-board/${program.id}`), 200, 'read the RBM board');
  planId = board.data?.governingPlanId ?? null;
  if (!planId) throw new Error('the RBM board names no plan in force, so no monitoring action can be logged');
  return planId;
}

async function ensureSignals({ api, run, tally }, program, planId, label) {
  const ids = {};
  await run.step(`RBM: ${SIGNALS.length} central-monitoring signals on ${label}`, async () => {
    const listed = await list(api, `${M}/rbm-signals?program_id=${program.id}`, 'list signals');
    const owner = await ownerIds(api);
    const actions = new Set((await list(api, `${M}/rbm-monitoring-actions?program_id=${program.id}`, 'list monitoring actions')).map((a) => a.description));
    let created = 0, dispositioned = 0;
    for (const s of SIGNALS) {
      let row = listed.find((r) => r.title === s.title) ?? null;
      if (row) tally.found('rbm-signal');
      else {
        row = must(await api('POST', `${M}/rbm-signals`, {
          programId: program.id, siteId: s.site, source: s.source, signalType: s.type, severity: s.severity, title: s.title, detail: s.detail,
        }), 201, `log signal "${s.title}"`).data;
        tally.created('rbm-signal');
        created += 1;
      }
      ids[s.key] = row.id;
      // A disposition is recorded once, on a signal nobody has touched.
      const d = s.disposition;
      if (!d || row.status !== 'new') continue;
      if (d.status === 'triaged') {
        must(await api('PATCH', `${M}/rbm-signals/${row.id}`, { status: 'triaged' }), 200, `triage "${s.title}"`);
      } else {
        const a = d.action && !actions.has(d.action.description) ? d.action : null;
        const out = must(await api('POST', `${M}/rbm-signals/${row.id}/investigate`, {
          status: d.status, resolutionNotes: d.notes,
          action: a ? { planId, actionType: a.type, description: a.description, priority: a.priority, owner: owner(a.owner), dueDate: dateIn(a.dueInDays) } : null,
        }), 200, `document the investigation of "${s.title}"`).data;
        if (a && !out?.actionCreated) throw new Error(`the investigation of "${s.title}" raised no action: ${JSON.stringify(out?.actionRefused ?? null)}`);
        if (a) tally.created('rbm-action');
      }
      tally.created('rbm-signal-disposition');
      dispositioned += 1;
    }
    return `${created} logged, ${SIGNALS.length - created} already there; ${dispositioned} dispositioned`;
  });
  return ids;
}

async function ensureActions({ api, run, tally }, program, planId, signalIds, label) {
  await run.step(`RBM: ${ACTIONS.length} monitoring actions on ${label}`, async () => {
    const have = new Set((await list(api, `${M}/rbm-monitoring-actions?program_id=${program.id}`, 'list monitoring actions')).map((a) => a.description));
    const owner = await ownerIds(api);
    let created = 0;
    for (const a of ACTIONS) {
      if (have.has(a.description)) { tally.found('rbm-action'); continue; }
      const row = must(await api('POST', `${M}/rbm-monitoring-actions`, {
        planId, actionType: a.type, description: a.description, priority: a.priority, owner: owner(a.owner),
        dueDate: dateIn(a.dueInDays), ...(a.signal && signalIds[a.signal] ? { signalId: signalIds[a.signal] } : {}),
      }), 201, `add action "${a.description}"`).data;
      // Start, then Complete, as the plan board's buttons do.
      const steps = a.status === 'done' ? ['in_progress', 'done'] : a.status === 'in_progress' ? ['in_progress'] : [];
      for (const status of steps) must(await api('PATCH', `${M}/rbm-monitoring-actions/${row.id}`, { status }), 200, `move "${a.description}" to ${status}`);
      tally.created('rbm-action');
      created += 1;
    }
    return `${created} added, ${ACTIONS.length - created} already there`;
  });
}

/* ───────────────────────── The board, as the screen reads it ───────────────────────── */

async function confirmBoard({ api, run }, program, label) {
  return run.step(`RBM: the board and roster read back on ${label}`, async () => {
    const roster = await list(api, '/api/mdx-rbm/rbm-programs', 'read the monitoring roster');
    if (!roster.some((p) => p.id.toLowerCase() === program.id.toLowerCase())) throw new Error(`the RBM roster does not list ${label}`);
    const b = must(await api('GET', `/api/mdx-rbm/rbm-board/${program.id}`), 200, 'read the RBM board').data;
    const s = b.summary;
    const gaps = [];
    if (!b.assessment || !b.items.length) gaps.push('RACT');
    if (s.kris.total < KRIS.length || s.kris.notEvaluated) gaps.push('KRI readings');
    if (s.qtls.total < QTLS.length || s.qtls.notEvaluated) gaps.push('QTL values');
    if (s.signals.total < SIGNALS.length) gaps.push('signals');
    if (s.patients.scored < SUBJECTS.length) gaps.push('patient profiles');
    if (!b.plan || !b.actions.length) gaps.push('plan actions');
    if (!b.freshness.length) gaps.push('source freshness');
    if (gaps.length) throw new Error(`the RBM board is missing: ${gaps.join(', ')}`);
    run.note('RBM: Site risk and Site oversight stay empty, and "Run central monitoring" finds no outliers, because the site-risk snapshot is derived only from Site Intelligence (site_intel.sites) and no mounted route writes it. Site numbers appear in signals, subject ids and action descriptions instead.');
    const summary = { overallRisk: s.overallRisk, ctq: s.riskItems.total, kris: s.kris, qtls: s.qtls, signals: s.signals, patients: s.patients, sites: s.sites,
      plan: b.plan && { id: b.plan.id, status: b.plan.status }, actions: b.actions.length, attention: b.attention.length, sources: b.freshness.map((f) => `${f.source} ${f.ageDays}d`) };
    run.record('rbm', summary);
    return `risk ${s.overallRisk}; ${s.riskItems.total} CtQ; KRIs ${s.kris.red} red / ${s.kris.amber} amber of ${s.kris.total}; QTLs ${s.qtls.approaching} approaching of ${s.qtls.total}; ${s.signals.open} open signals; ${s.patients.flagged} flagged / ${s.patients.review} review of ${s.patients.scored}; plan ${b.plan.status} with ${b.actions.length} actions; ${b.attention.length} attention items`;
  });
}

/**
 * Seed LMN-201's risk-based monitoring. ctx: { api, run, tally, identity };
 * program: { id } (the LMN-201 project); label: what the steps call it.
 */
export async function ensureLumenRbm(ctx, program, label) {
  const assessment = await ensureAssessment(ctx, program, label);
  await ensureIndicators(ctx, program, assessment, label);
  const planId = await ensurePlan(ctx, program, assessment, label);
  const signalIds = await ensureSignals(ctx, program, planId, label);
  await ensureActions(ctx, program, planId, signalIds, label);
  await confirmBoard(ctx, program, label);
}
