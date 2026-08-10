/**
 * 50-postmarket.mjs — GA demo seed: post-market vigilance signals + CAPA records.
 *
 * Surface fed by this module:
 *   GET /api/mdx/postmarket (server/routes/mdx-postmarket.ts) — the kit
 *   Post-market Vigilance surface (client usePostmarket). Its two reads:
 *     1. SELECT v.id, p.code AS program_code, v.kind, v.occurred_at, v.payload,
 *               v.reason, v.actor
 *          FROM vigilance_events v
 *          JOIN regulatory_programs p ON p.id::text = v.program_id::text
 *         WHERE p.organization_id = $org
 *         ORDER BY v.occurred_at DESC NULLS LAST LIMIT 500
 *     2. SELECT c.id, c.capa_code, c.title, p.code AS program_code, c.state,
 *               c.assigned_to, c.created_at, c.risk_level, c.source_refs
 *          FROM capa_records c
 *          LEFT JOIN regulatory_programs p ON p.id::text = c.program_id::text
 *         WHERE p.organization_id = $org OR p.organization_id IS NULL
 *         ORDER BY c.created_at DESC NULLS LAST LIMIT 500
 *   Tenant scoping is therefore the program join — both tables carry only
 *   program_id (text), so every seeded row references the org's BX-204 CGM
 *   program (the demo portfolio's one device program; MDR vigilance is
 *   device-scope). If the program cannot be resolved the module skips: an
 *   unresolvable program_id would leave vigilance rows invisible (inner join)
 *   and would surface capa rows to every tenant via `organization_id IS NULL`.
 *
 * Route payload mapping (signals): device←p.code, source←payload.source,
 * severity←payload.severity ('critical'|'review'|'watching'; kit counts
 * critical and treats state==='closed-trend' as closed), count←payload.count,
 * vs←payload.vs, state←payload.state, summary←reason, owner←actor,
 * kind←v.kind. CAPAs: stage←state, owner←assigned_to, critical←risk_level in
 * (high, critical), linked←source_refs — the route casts source_refs to
 * string[] and the kit renders the entries verbatim, so source_refs is seeded
 * as a plain JSON array of reference codes (the schema comment's
 * {kind,id,label} shape would render as [object Object]).
 *
 * DDL sources: migrations/20260504_capa_mdr.sql, mirrored 1:1 by
 * shared/schema/capa-mdr.ts (capaRecords, vigilanceEvents). CHECK vocabulary
 * honoured here:
 *   vigilance_events.kind        complaint_received | complaint_triaged |
 *     complaint_state_changed | mdr_opened | mdr_clock_computed | mdr_filed |
 *     mdr_acknowledged | mdr_state_changed | capa_opened | capa_state_changed |
 *     capa_action_added | capa_action_completed | capa_effectiveness_verified |
 *     capa_closed | note
 *   vigilance_events.entity_type complaint | mdr_event | capa_record | capa_action
 *   capa_records.type            corrective | preventive | both
 *   capa_records.source          complaint | internal_audit | external_audit |
 *     mdr | nonconformance | management_review | supplier | inspection_finding |
 *     risk_review | trend_signal | other
 *   capa_records.risk_level      low | medium | high | critical
 *   capa_records.state           open | investigation | action_planned |
 *     action_implemented | effectiveness_check | closed_effective |
 *     closed_not_effective | escalated
 * NOT NULLs covered: vigilance_events(program_id, kind, entity_type,
 * entity_id, occurred_at); capa_records(program_id, capa_code, title, type,
 * source). IMDRF Annex A/E and FDA device-problem codes live in payload JSON
 * (no dedicated columns exist on vigilance_events — mdr_events carries the
 * coded columns, which is out of scope here).
 *
 * Idempotency: capa_records keys on capa_code (capa_records_code_uq in the
 * SQL migration; SELECT-before-INSERT so the drizzle-pushed shape without the
 * index behaves identically and a duplicate can never abort the caller's
 * transaction). vigilance_events has no natural unique key (append-only
 * timeline), so rows carry deterministic fixed UUIDs and are
 * SELECT-before-INSERT on id. Vigilance events that reference a seeded CAPA
 * use the id actually resolved for that capa_code (a pre-existing row keeps
 * its own id). Timestamps are SQL now() ± interval offsets.
 */

/* Deterministic BX-204 program UUID — must match scripts/seed-mdx-beta.mjs
   PROG.BX_204 and scripts/seed/ga-demo.d/{10-risk,40-submission-udi}.mjs so
   every seeder converges on the same regulatory_programs row. */
const BX204_PROGRAM_ID = '11111111-2222-3333-4444-000000000204';

/* Fixed entity UUIDs. complaints / mdr_events rows themselves are not seeded
   (out of scope — the surface reads only vigilance_events + capa_records, and
   vigilance_events.entity_id carries no FK), but the ids keep the timeline
   internally consistent and re-runnable. */
const COMPLAINT_LIFTOFF = '55555555-6666-7777-8888-000000000001';
const MDR_HYPO_ALARM    = '66666666-7777-8888-9999-000000000092'; // MDR-2026-0092 (FDA 30-day)
const MDR_EU_LACERATION = '66666666-7777-8888-9999-000000000089'; // MDR-2026-0089 (EU Art. 87)

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  return Boolean(rows[0]?.t);
}

/* Resolve a user id for program leadership; fall back to admin. */
async function resolveUserId(client, email, admin) {
  const { rows } = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  return rows[0]?.id ?? admin.id;
}

/* Resolve (or create) the BX-204 CGM program so every row joins back to the
   demo org. Wrapped in a SAVEPOINT: a failed statement would otherwise abort
   the orchestrator's whole transaction (25P02). */
async function resolveBx204ProgramId(client, org, admin) {
  if (!(await tableExists(client, 'regulatory_programs'))) {
    console.log('   ⚠ regulatory_programs not found — skipping postmarket vigilance (rows would not be tenant-scoped)');
    return null;
  }
  const sel = `SELECT id FROM regulatory_programs
                WHERE organization_id = $1 AND code = 'BX-204' AND deleted_at IS NULL
                LIMIT 1`;
  try {
    await client.query('SAVEPOINT sp_postmarket_program');
    let { rows } = await client.query(sel, [org.id]);
    if (!rows[0]) {
      const leadUserId = await resolveUserId(client, 'admin@concept2cure.pro', admin);
      /* Values mirror scripts/seed-mdx-beta.mjs so either seeder can create
         the row first. No ON CONFLICT target: covers both the PK and the
         (organization_id, code) unique index. */
      await client.query(
        `INSERT INTO regulatory_programs (
           id, organization_id, name, code, description, program_type, product_type,
           device_class, regulatory_path, primary_agency, product_name, status, phase, priority, lead_user_id
         ) VALUES (
           $1, $2, $3, 'BX-204', $4, '510K', 'device', 'II', '510k', 'FDA', $5,
           'active', 'authoring', 'high', $6
         )
         ON CONFLICT DO NOTHING`,
        [
          BX204_PROGRAM_ID,
          org.id,
          'BX-204 Continuous Glucose Monitor',
          'AI-assisted CGM with locked algorithm scope (v1.0).',
          'BX-204 CGM',
          leadUserId,
        ],
      );
      ({ rows } = await client.query(sel, [org.id]));
    }
    await client.query('RELEASE SAVEPOINT sp_postmarket_program');
    return rows[0]?.id ?? null;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_postmarket_program');
    console.log('   ⚠ could not resolve the BX-204 program — skipping postmarket vigilance');
    return null;
  }
}

/* ── CAPA fixture (5 records, BX-204 CGM) ───────────────────────────────────
   States span the 21 CFR 820.100 lifecycle: investigation → action_planned →
   action_implemented → effectiveness_check → closed_effective. risk_level
   high/critical rows light the kit's "critical" badge. source_refs carry the
   signal / MDR / ECR codes the timeline below narrates. */
const CAPAS = [
  {
    id: '77777777-8888-9999-aaaa-000000000031',
    code: 'CAPA-2026-0031',
    title: 'Sensor adhesive lift-off in users above 85 kg — adhesive Rev D rollout',
    summary:
      'Week-2 lift-off cluster concentrated in high-BMI users; adhesive formulation change plus applicator pressure guidance.',
    type: 'corrective',
    source: 'trend_signal',
    sourceRefs: ['SIG-2186', 'MDR-2026-0090', 'ECR-1071'],
    riskLevel: 'high',
    state: 'action_implemented',
    assignedTo: 'A. Kaur',
    createdAgo: '21 days 3 hours',
    updatedAgo: '2 days 1 hour',
    targetCloseIn: '21 days',
    problemStatement:
      'Sensor lift-off events at day 8-10 of the 10-day wear period rose 340% quarter over quarter, clustered in users above 85 kg (IMDRF A0502 adhesion failure; FDA device problem code 1546).',
    containmentActions:
      'Adhesive lot 24E placed on hold; customer notice with overpatch guidance issued to distributors.',
    rootCauseAnalysis: {
      method: '5-why with Ishikawa confirmation run',
      root_cause:
        'Acrylic adhesive shear strength degrades above 32 C skin-interface temperature; the specification did not model high-BMI skin curvature under flexion.',
      verified: true,
    },
    correctiveActionPlan:
      'Qualify adhesive Rev D (higher shear tack), update applicator IFU section 4.2, and add a curvature fixture to design verification protocol DVP-204-117.',
    effectivenessCheckCriteria:
      'Lift-off complaint rate below 0.5 per 1,000 sensor-days over 90 days after Rev D rollout.',
    createdBy: 'david.kim@concept2cure.pro',
  },
  {
    id: '77777777-8888-9999-aaaa-000000000030',
    code: 'CAPA-2026-0030',
    title: 'Low-glucose alarm not raised during rapid drop — algorithm threshold investigation',
    summary:
      'Three severe-hypoglycemia field reports without a low-glucose alert; rapid-drop compensation logic under investigation.',
    type: 'corrective',
    source: 'mdr',
    sourceRefs: ['MDR-2026-0092', 'SIG-2181'],
    riskLevel: 'critical',
    state: 'investigation',
    assignedTo: 'R. Patel',
    createdAgo: '9 days 3 hours',
    updatedAgo: '1 day 2 hours',
    targetCloseIn: '45 days',
    problemStatement:
      'Three field reports of severe hypoglycemia with no low-glucose alert (FDA device problem code 1069, failure to alarm; IMDRF health effect E0629 hypoglycemia). Rapid glucose descent may outpace the alarm evaluation window.',
    containmentActions:
      'Alarm-sensitivity telemetry audit running across the installed base; field safety notice drafted pending root-cause confirmation.',
    rootCauseAnalysis: null,
    correctiveActionPlan: null,
    effectivenessCheckCriteria: null,
    createdBy: 'david.kim@concept2cure.pro',
  },
  {
    id: '77777777-8888-9999-aaaa-000000000029',
    code: 'CAPA-2026-0029',
    title: 'Transmitter battery early depletion after cold-chain excursions — incoming test tightening',
    summary:
      'Batteries exposed to sub-spec shipping temperatures deplete 20-30% early; incoming acceptance and shipping qualification tightened.',
    type: 'both',
    source: 'complaint',
    sourceRefs: ['CMP-2026-0143', 'NC-2026-0057'],
    riskLevel: 'medium',
    state: 'effectiveness_check',
    assignedTo: 'D. Kim',
    createdAgo: '48 days 5 hours',
    updatedAgo: '5 days 4 hours',
    targetCloseIn: '30 days',
    problemStatement:
      'Complaint cluster CMP-2026-0143: transmitters from two shipping lanes showing end-of-life alerts at month 8 of a 12-month rating after documented cold-chain excursions below -10 C.',
    containmentActions:
      'Affected distribution lanes moved to qualified insulated packaging; stock from excursion-flagged shipments quarantined.',
    rootCauseAnalysis: {
      method: 'Fault tree with lot traceability review',
      root_cause:
        'Electrolyte passivation after sustained exposure below -10 C; incoming acceptance did not sample for excursion-exposed lots.',
      verified: true,
    },
    correctiveActionPlan:
      'Add temperature-indicator review to incoming inspection SOP-INC-011, sample excursion-flagged lots at AQL 0.65, and requalify the two shipping lanes.',
    effectivenessCheckCriteria:
      'No battery-depletion complaint attributable to a shipping excursion for two consecutive months.',
    createdBy: 'david.kim@concept2cure.pro',
  },
  {
    id: '77777777-8888-9999-aaaa-000000000028',
    code: 'CAPA-2026-0028',
    title: 'Humid-climate adhesive complaints — IFU update and applicator bonding change',
    summary:
      'Seasonal lift-off complaints in high-humidity regions; IFU skin-prep update plus applicator bonding pressure change. Closed effective.',
    type: 'both',
    source: 'trend_signal',
    sourceRefs: ['SIG-2168'],
    riskLevel: 'medium',
    state: 'closed_effective',
    assignedTo: 'A. Kaur',
    createdAgo: '96 days 2 hours',
    updatedAgo: '12 days 6 hours',
    targetCloseIn: null,
    closedAgo: '12 days 6 hours',
    closedBy: 'D. Kim',
    problemStatement:
      'Complaint rate for adhesive lift-off doubled during humid months in three coastal distribution regions (IMDRF A0502).',
    containmentActions:
      'Interim customer letter with skin-preparation guidance; overpatch samples included in affected-region shipments.',
    rootCauseAnalysis: {
      method: 'Ishikawa with regional complaint stratification',
      root_cause:
        'IFU skin-prep step insufficient for high-humidity application; applicator bonding pressure at the low end of specification.',
      verified: true,
    },
    correctiveActionPlan:
      'IFU rev C skin-preparation section released; applicator spring force respecified and verified under DVP-204-104.',
    effectivenessCheckCriteria:
      'Humid-region lift-off complaint rate below 0.5 per 1,000 sensor-days for two consecutive quarters.',
    effectivenessCheckResult: {
      outcome: 'effective',
      verified_by: 'D. Kim',
      narrative:
        'Complaint rate held at 0.3 per 1,000 sensor-days for two consecutive quarters after IFU rev C and applicator change.',
    },
    createdBy: 'david.kim@concept2cure.pro',
  },
  {
    id: '77777777-8888-9999-aaaa-000000000027',
    code: 'CAPA-2026-0027',
    title: 'Sensor membrane coating lot variability — supplier process audit and incoming inspection',
    summary:
      'Preventive action from supplier audit SUP-AUD-2026-11: coating thickness drift trending toward specification limit.',
    type: 'preventive',
    source: 'supplier',
    sourceRefs: ['SUP-AUD-2026-11'],
    riskLevel: 'low',
    state: 'action_planned',
    assignedTo: 'D. Kim',
    createdAgo: '15 days 1 hour',
    updatedAgo: '3 days 2 hours',
    targetCloseIn: '60 days',
    problemStatement:
      'Supplier audit found membrane coating thickness Cpk of 1.1 (internal target 1.33). No nonconforming lot shipped; trend indicates drift risk.',
    containmentActions: null,
    rootCauseAnalysis: null,
    correctiveActionPlan:
      'Supplier to requalify the coating line with tightened process window; add coating thickness to incoming skip-lot sampling plan.',
    effectivenessCheckCriteria:
      'Coating thickness Cpk at or above 1.33 across the next five supplier lots.',
    createdBy: 'david.kim@concept2cure.pro',
  },
];

/* ── Vigilance timeline fixture (8 events, BX-204 CGM) ──────────────────────
   Kinds follow the DB CHECK vocabulary; the kit-facing feed fields (source,
   severity, count, vs, state, plus IMDRF Annex A/E and FDA device-problem
   codes) ride in payload — exactly where the route reads them. Severity mix:
   3 critical / 2 review / 3 watching; state 'closed-trend' marks the three
   closed items. capaCode entries resolve entity_id to the seeded CAPA row.
   The two newest events are days-fresh so the surface reads as live. */
const EVENTS = [
  {
    id: '88888888-9999-aaaa-bbbb-000000000001',
    ago: '14 days 6 hours',
    kind: 'complaint_received',
    entityType: 'complaint',
    entityId: COMPLAINT_LIFTOFF,
    actor: 'E. Watson',
    actorRole: 'Complaint intake',
    reason:
      'Sensor detached on day 3 of wear after swimming; no patient harm reported. Complaint file opened under 21 CFR 820.198.',
    payload: {
      source: 'complaint',
      severity: 'review',
      count: 1,
      vs: 'new',
      state: 'investigate',
      complaint_code: 'CMP-2026-0161',
      device_problem: { imdrf_code: 'A0502', imdrf_term: 'Adhesion failure', fda_code: '1546', fda_term: 'Adhesive' },
    },
  },
  {
    id: '88888888-9999-aaaa-bbbb-000000000002',
    ago: '13 days 4 hours',
    kind: 'complaint_triaged',
    entityType: 'complaint',
    entityId: COMPLAINT_LIFTOFF,
    actor: 'E. Watson',
    actorRole: 'Complaint intake',
    reason:
      'Triage complete: not reportable under 21 CFR 803.20 (no harm, known failure mode); folded into the adhesive lift-off trend file.',
    payload: {
      source: 'complaint',
      severity: 'watching',
      count: 1,
      vs: '—',
      state: 'closed-trend',
      complaint_code: 'CMP-2026-0161',
      decision: 'not_reportable',
    },
  },
  {
    id: '88888888-9999-aaaa-bbbb-000000000003',
    ago: '10 days 5 hours',
    kind: 'mdr_opened',
    entityType: 'mdr_event',
    entityId: MDR_HYPO_ALARM,
    actor: 'S. Chen',
    actorRole: 'VP Regulatory Affairs',
    reason:
      'Three MAUDE-correlated reports of severe hypoglycemia without a low-glucose alert; serious-injury MDR opened under 21 CFR 803.50.',
    payload: {
      source: 'MAUDE',
      severity: 'critical',
      count: 3,
      vs: 'new',
      state: 'mdr-30d',
      mdr_code: 'MDR-2026-0092',
      us_fda_report_type: 'initial_30day',
      device_problem: { imdrf_code: 'A090601', imdrf_term: 'Failure to alarm', fda_code: '1069' },
      health_effect: { imdrf_code: 'E0629', imdrf_term: 'Hypoglycemia' },
    },
  },
  {
    id: '88888888-9999-aaaa-bbbb-000000000004',
    ago: '10 days 4 hours',
    kind: 'mdr_clock_computed',
    entityType: 'mdr_event',
    entityId: MDR_HYPO_ALARM,
    actor: 'S. Chen',
    actorRole: 'VP Regulatory Affairs',
    reason:
      'Reportability clock computed for MDR-2026-0092: initial 30-calendar-day report due from the awareness date; countdown on the compliance dashboard.',
    payload: {
      source: 'MDR clock',
      severity: 'critical',
      count: 3,
      vs: '—',
      state: 'mdr-30d',
      mdr_code: 'MDR-2026-0092',
      report_type: 'initial_30day',
      days_to_due: 30,
    },
  },
  {
    id: '88888888-9999-aaaa-bbbb-000000000005',
    ago: '9 days 3 hours',
    kind: 'capa_opened',
    entityType: 'capa_record',
    capaCode: 'CAPA-2026-0030',
    actor: 'D. Kim',
    actorRole: 'Quality Assurance Lead',
    reason:
      'CAPA-2026-0030 opened from MDR-2026-0092: rapid-drop alarm threshold investigation, with installed-base telemetry audit as containment.',
    payload: {
      source: 'MDR',
      severity: 'critical',
      count: 3,
      vs: '—',
      state: 'investigate',
      capa_code: 'CAPA-2026-0030',
      risk_level: 'critical',
    },
  },
  {
    id: '88888888-9999-aaaa-bbbb-000000000006',
    ago: '7 days 6 hours',
    kind: 'mdr_filed',
    entityType: 'mdr_event',
    entityId: MDR_EU_LACERATION,
    actor: 'S. Chen',
    actorRole: 'VP Regulatory Affairs',
    reason:
      'EU MDR Article 87 serious-incident report (sensor lift-off with skin laceration at removal) filed via EUDAMED within the 15-day window.',
    payload: {
      source: 'EUDAMED',
      severity: 'review',
      count: 1,
      vs: '—',
      state: 'filed',
      mdr_code: 'MDR-2026-0089',
      eu_mdr_severity: 'other_serious_15day',
      report_number: 'IR-2026-DE-004417',
      device_problem: { imdrf_code: 'A0502', imdrf_term: 'Adhesion failure' },
      health_effect: { imdrf_code: 'E0323', imdrf_term: 'Laceration' },
    },
  },
  {
    id: '88888888-9999-aaaa-bbbb-000000000007',
    ago: '5 days 2 hours',
    kind: 'mdr_acknowledged',
    entityType: 'mdr_event',
    entityId: MDR_EU_LACERATION,
    actor: 'S. Chen',
    actorRole: 'VP Regulatory Affairs',
    reason:
      'Competent authority acknowledged report IR-2026-DE-004417 with no further questions; event moved to trend monitoring.',
    payload: {
      source: 'EUDAMED',
      severity: 'watching',
      count: 1,
      vs: '—',
      state: 'closed-trend',
      mdr_code: 'MDR-2026-0089',
      acknowledgment: 'CA-DE-ACK-8821',
    },
  },
  {
    id: '88888888-9999-aaaa-bbbb-000000000008',
    ago: '2 days 4 hours',
    kind: 'capa_closed',
    entityType: 'capa_record',
    capaCode: 'CAPA-2026-0028',
    actor: 'D. Kim',
    actorRole: 'Quality Assurance Lead',
    reason:
      'CAPA-2026-0028 closed effective: humid-climate lift-off complaint rate below 0.5 per 1,000 sensor-days for two consecutive quarters.',
    payload: {
      source: 'CAPA',
      severity: 'watching',
      count: 1,
      vs: '-62%',
      state: 'closed-trend',
      capa_code: 'CAPA-2026-0028',
      outcome: 'effective',
    },
  },
];

export default async function seed(client, { org }) {
  const hasCapa = await tableExists(client, 'capa_records');
  const hasVigilance = await tableExists(client, 'vigilance_events');
  if (!hasCapa) console.log('   ⚠ capa_records not found — skipping');
  if (!hasVigilance) console.log('   ⚠ vigilance_events not found — skipping');
  if (!hasCapa && !hasVigilance) return;

  const programId = await resolveBx204ProgramId(client, org, admin);
  if (!programId) return; // warning already printed by the resolver

  // ── capa_records ──────────────────────────────────────────────────────────
  // Seeded first so timeline events can reference the resolved CAPA ids.
  const capaIdByCode = new Map();
  if (hasCapa) {
    let inserted = 0;
    let existing = 0;
    for (const c of CAPAS) {
      const dup = await client.query(
        `SELECT id FROM capa_records WHERE capa_code = $1 LIMIT 1`,
        [c.code],
      );
      if (dup.rows[0]) {
        capaIdByCode.set(c.code, dup.rows[0].id);
        existing += 1;
        continue;
      }
      const { rows } = await client.query(
        `INSERT INTO capa_records (
           id, program_id, capa_code, title, summary, type, source, source_refs,
           risk_level, assigned_to, target_close_date,
           problem_statement, containment_actions, root_cause_analysis,
           corrective_action_plan, effectiveness_check_criteria,
           effectiveness_check_result, state, closed_at, closed_by,
           created_at, updated_at, created_by, updated_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8::json,
           $9, $10,
           CASE WHEN $11::text IS NULL THEN NULL ELSE now() + $11::interval END,
           $12, $13, $14::json, $15, $16, $17::json, $18,
           CASE WHEN $19::text IS NULL THEN NULL ELSE now() - $19::interval END,
           $20,
           now() - $21::interval, now() - $22::interval, $23, $23
         )
         RETURNING id`,
        [
          c.id,
          programId,
          c.code,
          c.title,
          c.summary ?? null,
          c.type,
          c.source,
          JSON.stringify(c.sourceRefs ?? []),
          c.riskLevel,
          c.assignedTo ?? null,
          c.targetCloseIn ?? null,
          c.problemStatement ?? null,
          c.containmentActions ?? null,
          c.rootCauseAnalysis ? JSON.stringify(c.rootCauseAnalysis) : null,
          c.correctiveActionPlan ?? null,
          c.effectivenessCheckCriteria ?? null,
          c.effectivenessCheckResult ? JSON.stringify(c.effectivenessCheckResult) : null,
          c.state,
          c.closedAgo ?? null,
          c.closedBy ?? null,
          c.createdAgo,
          c.updatedAgo,
          c.createdBy ?? null,
        ],
      );
      capaIdByCode.set(c.code, rows[0].id);
      inserted += 1;
    }
    console.log(
      `   ✓ postmarket vigilance: ${inserted} capa_records seeded` +
        (existing ? ` (${existing} already present)` : ''),
    );
  }

  // ── vigilance_events ──────────────────────────────────────────────────────
  if (hasVigilance) {
    let inserted = 0;
    let existing = 0;
    for (const e of EVENTS) {
      const dup = await client.query(
        `SELECT 1 FROM vigilance_events WHERE id = $1 LIMIT 1`,
        [e.id],
      );
      if (dup.rows[0]) {
        existing += 1;
        continue;
      }
      // CAPA-linked events point at the row actually resolved above; the
      // deterministic fixture id is the fallback when capa_records is absent.
      const entityId = e.capaCode
        ? (capaIdByCode.get(e.capaCode) ?? CAPAS.find((c) => c.code === e.capaCode)?.id ?? e.id)
        : e.entityId;
      await client.query(
        `INSERT INTO vigilance_events (
           id, program_id, kind, entity_type, entity_id, actor, actor_role,
           occurred_at, payload, reason
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, now() - $8::interval, $9::json, $10
         )`,
        [
          e.id,
          programId,
          e.kind,
          e.entityType,
          entityId,
          e.actor ?? null,
          e.actorRole ?? null,
          e.ago,
          JSON.stringify(e.payload ?? {}),
          e.reason ?? null,
        ],
      );
      inserted += 1;
    }
    console.log(
      `   ✓ postmarket vigilance: ${inserted} vigilance_events seeded` +
        (existing ? ` (${existing} already present)` : ''),
    );
  }
}
