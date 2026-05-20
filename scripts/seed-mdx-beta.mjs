#!/usr/bin/env node
/**
 * seed-mdx-beta.mjs — MDX BETA program + Q-Sub fixtures
 *
 * Seeds the `regulatory_programs` and `q_*` tables with the data the
 * PreSubManager surface exercises (mirroring client/src/concept2cure/mdx/data/presub.ts).
 *
 * What it creates / upserts:
 *   - 5 device programs (BX-204, OR-801, RX-340, PM-660, NM-512) under the
 *     "concept2cure" organization so the BX-204 + OR-801 Q-Subs in the BFF
 *     resolve to a real program when the UI fetches the live list.
 *   - 7 Q-Submissions matching the fixture (Q251142, Q250987, Q250844,
 *     Q251331-package, Q251187, Q251402-plan, Q240721-integrate) with their
 *     questions, commitments, meetings and timeline entries.
 *
 * Idempotent: re-running upserts by deterministic UUID and skips child rows
 * that already exist (display_code unique on commitments, n unique per
 * submission on questions).
 *
 * Prerequisites:
 *   1. seed-ga-demo.mjs has run (creates the org and admin user).
 *   2. migration migrations/20260501_q_sub.sql has been applied.
 *
 * Usage:
 *   node scripts/seed-mdx-beta.mjs
 */

import pg from 'pg';

const { Pool } = pg;

// ── Database connection ─────────────────────────────────────────────────────

function getDbUrl() {
  const raw = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
  if (!raw) {
    console.error('ERROR: Set DATABASE_URL or DATABASE_NEON_NEW_SECRET');
    process.exit(1);
  }
  let url = raw;
  if (url.startsWith('psql ')) url = url.substring(5);
  if (
    (url.startsWith("'") && url.endsWith("'")) ||
    (url.startsWith('"') && url.endsWith('"'))
  ) {
    url = url.slice(1, -1);
  }
  return url.trim();
}

const dbUrl = getDbUrl();
const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
});

// ── Deterministic UUIDs (MDX BETA fixture namespace) ────────────────────────

// Programs — fixed v4-shaped UUIDs so seeds are stable across runs.
const PROG = {
  BX_204: '11111111-2222-3333-4444-000000000204',
  OR_801: '11111111-2222-3333-4444-000000000801',
  RX_340: '11111111-2222-3333-4444-000000000340',
  PM_660: '11111111-2222-3333-4444-000000000660',
  NM_512: '11111111-2222-3333-4444-000000000512',
  IV_415: '11111111-2222-3333-4444-000000000415', // CER program — needed for the
                                                    // CER tab to find a program
                                                    // when no row is preselected
                                                    // (App.tsx programs.find by
                                                    // pathway==='cer').
};

// Q-Submissions — keyed by fixture id.
const QSUB = {
  q1142: '22222222-3333-4444-5555-000000001142', // Q251142 BX-204 presub feedback
  q0987: '22222222-3333-4444-5555-000000000987', // Q250987 OR-801 await
  q0844: '22222222-3333-4444-5555-000000000844', // Q250844 OR-801 SIR feedback
  q1331: '22222222-3333-4444-5555-000000001331', // RX-340 package
  q1187: '22222222-3333-4444-5555-000000001187', // PM-660 await
  q1402: '22222222-3333-4444-5555-000000001402', // NM-512 SRD plan
  q0721: '22222222-3333-4444-5555-000000000721', // BX-204 integrate
};

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getOrgId(client) {
  const { rows } = await client.query(
    `SELECT id FROM organizations WHERE slug = 'concept2cure' LIMIT 1`,
  );
  if (rows.length === 0) {
    throw new Error(
      'Organization "concept2cure" not found — run scripts/seed-ga-demo.mjs first',
    );
  }
  return rows[0].id;
}

async function upsertProgram(client, orgId, id, def) {
  await client.query(
    `INSERT INTO regulatory_programs (
       id, organization_id, name, code, description, program_type, product_type,
       device_class, regulatory_path, primary_agency, product_name, status, phase,
       priority, metadata, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'device', $7, $8, 'FDA', $9, 'active',
       'authoring', 'high', $10::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       name        = EXCLUDED.name,
       description = EXCLUDED.description,
       metadata    = EXCLUDED.metadata,
       updated_at  = NOW()`,
    [
      id,
      orgId,
      def.name,
      def.code,
      def.description,
      def.programType,
      def.deviceClass,
      def.regulatoryPath,
      def.productName,
      JSON.stringify(def.metadata ?? null),
    ],
  );
}

async function upsertQSubmission(client, id, def) {
  await client.query(
    `INSERT INTO q_submissions (
       id, program_id, q_number, q_sub_type, title, stage, days_in,
       filed_at, target_date, fda_team, tone, summary, created_by, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              NOW() - interval '1 day' * $14, NOW())
     ON CONFLICT (id) DO UPDATE SET
       q_number    = EXCLUDED.q_number,
       title       = EXCLUDED.title,
       stage       = EXCLUDED.stage,
       days_in     = EXCLUDED.days_in,
       filed_at    = EXCLUDED.filed_at,
       target_date = EXCLUDED.target_date,
       fda_team    = EXCLUDED.fda_team,
       tone        = EXCLUDED.tone,
       summary     = EXCLUDED.summary,
       updated_at  = NOW()`,
    [
      id,
      def.programId,
      def.qNumber,
      def.qSubType,
      def.title,
      def.stage,
      def.daysIn,
      def.filedAt,
      def.targetDate,
      def.fdaTeam,
      def.tone,
      def.summary,
      'jm.smith@concept2cure.pro',
      def.daysIn || 30,
    ],
  );
}

async function upsertMeeting(client, qSubId, m) {
  // Delete-and-insert keeps things simple; meetings are append-only in real
  // life but for fixtures we want re-runs to produce a clean state.
  await client.query(`DELETE FROM q_sub_meetings WHERE q_submission_id = $1`, [qSubId]);
  if (!m) return;
  await client.query(
    `INSERT INTO q_sub_meetings (
       q_submission_id, meeting_date, kind, fda_team_display, confirmed
     ) VALUES ($1, $2, $3, $4, $5)`,
    [qSubId, m.date, m.kind, m.team, m.confirmed],
  );
}

async function upsertQuestions(client, qSubId, questions) {
  for (const q of questions) {
    const ins = await client.query(
      `INSERT INTO q_sub_questions (
         q_submission_id, n, question, our_position, fda_response, status
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (q_submission_id, n) DO UPDATE SET
         question      = EXCLUDED.question,
         our_position  = EXCLUDED.our_position,
         fda_response  = EXCLUDED.fda_response,
         status        = EXCLUDED.status,
         updated_at    = NOW()
       RETURNING id`,
      [qSubId, q.n, q.q, q.ourPosition, q.fdaResponse, q.status],
    );
    const questionId = ins.rows[0].id;

    for (const c of q.commitments ?? []) {
      await client.query(
        `INSERT INTO q_sub_commitments (
           q_sub_question_id, display_code, text, dossier_link_kind,
           dossier_link_label, dossier_link_section_id, rolled_in,
           rolled_in_at, rolled_in_by, blocker
         ) VALUES ($1, $2, $3, $4, $5, $6, $7,
                   CASE WHEN $7 THEN NOW() ELSE NULL END,
                   CASE WHEN $7 THEN $8 ELSE NULL END,
                   $9)
         ON CONFLICT (display_code) DO UPDATE SET
           text                     = EXCLUDED.text,
           dossier_link_kind        = EXCLUDED.dossier_link_kind,
           dossier_link_label       = EXCLUDED.dossier_link_label,
           dossier_link_section_id  = EXCLUDED.dossier_link_section_id,
           rolled_in                = EXCLUDED.rolled_in,
           rolled_in_at             = CASE WHEN EXCLUDED.rolled_in THEN NOW() ELSE NULL END,
           rolled_in_by             = CASE WHEN EXCLUDED.rolled_in THEN EXCLUDED.rolled_in_by ELSE NULL END,
           blocker                  = EXCLUDED.blocker,
           updated_at               = NOW()`,
        [
          questionId,
          c.displayCode,
          c.text,
          c.dossierLink.kind,
          c.dossierLink.label,
          String(c.dossierLink.sectionId),
          c.rolledIn,
          'jm.smith@concept2cure.pro',
          c.blocker ?? false,
        ],
      );
    }
  }
}

async function upsertTimeline(client, qSubId, entries) {
  await client.query(`DELETE FROM q_sub_timeline_entries WHERE q_submission_id = $1`, [qSubId]);
  for (const t of entries) {
    await client.query(
      `INSERT INTO q_sub_timeline_entries (
         q_submission_id, "when", who, what, occurred_at
       ) VALUES ($1, $2, $3, $4, $5)`,
      [qSubId, t.when, t.who, t.what, t.occurredAt],
    );
  }
}

// ── Fixture data ────────────────────────────────────────────────────────────

const PROGRAMS = [
  {
    id: PROG.BX_204,
    code: 'BX-204',
    name: 'BX-204 Continuous Glucose Monitor',
    description: 'AI-assisted CGM with locked algorithm scope (v1.0).',
    programType: '510K',
    deviceClass: 'II',
    regulatoryPath: '510k',
    productName: 'BX-204 CGM',
  },
  {
    id: PROG.OR_801,
    code: 'OR-801',
    name: 'OR-801 Pedicle Screw System',
    description: 'Class II spinal fixation system; equivalence to K191822.',
    programType: '510K',
    deviceClass: 'II',
    regulatoryPath: '510k',
    productName: 'OR-801 Pedicle Screw System',
  },
  {
    id: PROG.RX_340,
    code: 'RX-340',
    name: 'RX-340 Surgical Stapler',
    description: 'Powered surgical stapler — predicate selection in scope.',
    programType: '510K',
    deviceClass: 'II',
    regulatoryPath: '510k',
    productName: 'RX-340 Surgical Stapler',
  },
  {
    id: PROG.PM_660,
    code: 'PM-660',
    name: 'PM-660 Patient Monitor',
    description: 'Software-as-medical-device patient monitor; SBOM in scope.',
    programType: '510K',
    deviceClass: 'II',
    regulatoryPath: '510k',
    productName: 'PM-660 Patient Monitor',
  },
  {
    id: PROG.NM_512,
    code: 'NM-512',
    name: 'NM-512 Neuromodulation Lead',
    description: 'Chronic implantable neuromodulation lead.',
    programType: 'PMA',
    deviceClass: 'III',
    regulatoryPath: 'pma',
    productName: 'NM-512 Lead',
  },
  {
    id: PROG.IV_415,
    code: 'IV-415',
    name: 'IV-415 Companion Diagnostic',
    description: 'CDx assay supporting EU MDR Article 61 clinical evaluation.',
    programType: 'CER',
    deviceClass: 'III',
    regulatoryPath: 'cer',
    productName: 'IV-415 CoDx Assay',
    /* Optional metadata the route handlers honour:
        clinicalStudyId — explicit clinical_ops.studies UUID for PMA trial
                          metrics (avoids the productName ILIKE indication
                          fuzzy match that could pick up wrong studies).
        ndcCode         — NDC code for FAERS adverse-event lookup.
       Empty here; org admins set these via metadata edits on the program. */
    metadata: { clinicalStudyId: null, ndcCode: null },
  },
];

// Q251142 — BX-204 predicate / AI scope (the flagship "feedback" example).
const QSUB_1142 = {
  id: QSUB.q1142,
  programId: PROG.BX_204,
  qNumber: 'Q251142',
  qSubType: 'presub',
  title: 'Predicate strategy and AI/ML algorithm scope',
  stage: 'feedback',
  daysIn: 4,
  filedAt: '2025-03-14',
  targetDate: '2025-05-28',
  fdaTeam: 'OHT2 — Diabetes',
  tone: 'ok',
  summary:
    'BX-204 sought CDRH agreement on predicate K212284 (Dexcom G6) and locking the AI/ML algorithm scope ahead of a Q3 510(k) filing. Meeting June 3 — written minutes received June 12.',
  meeting: {
    date: '2025-06-03',
    kind: 'Tele · 60 min',
    team: 'Dr. K. Patel (DDH/OHT2)',
    confirmed: true,
  },
  questions: [
    {
      n: 1,
      q: 'Does FDA agree K212284 is a suitable primary predicate, given the AI-derived trend arrows added to BX-204?',
      ourPosition:
        'K212284 same intended use, technology, target population. AI-derived features are an output enhancement and do not change indications.',
      fdaResponse:
        'FDA agrees K212284 is appropriate as the primary predicate. Recommend including K223341 as a reference predicate to address the trend-arrow technology. Sponsor should provide a Technology Difference Justification per §6 of the eSTAR.',
      status: 'answered',
      commitments: [
        {
          displayCode: 'cm-1142-1',
          text: 'Add K223341 as reference predicate; draft Technology Difference Justification',
          dossierLink: { kind: 'k510-section', label: 'eSTAR §6.1', sectionId: '6' },
          rolledIn: true,
        },
      ],
    },
    {
      n: 2,
      q: 'Is the locking strategy for v1.0 of the algorithm — fixed weights, no on-device update — acceptable for a traditional 510(k) submission?',
      ourPosition: 'Algorithm is locked at submission. PCCP not requested for v1.0. Future updates would file new 510(k).',
      fdaResponse:
        'Locked algorithm acceptable. Provide an algorithm-change protocol in the device description that defines what triggers a new submission. Note: any model retraining post-clearance requires new 510(k).',
      status: 'answered',
      commitments: [
        {
          displayCode: 'cm-1142-2',
          text: 'Author algorithm-change protocol (device description §4.3)',
          dossierLink: { kind: 'k510-section', label: 'eSTAR §4.3', sectionId: '4' },
          rolledIn: true,
        },
      ],
    },
    {
      n: 3,
      q: 'Does the proposed clinical accuracy study (n=156, 14 days, MARD endpoint at ≤9.5%) provide sufficient evidence?',
      ourPosition: 'Powered for non-inferiority vs YSI reference. Two sites, mixed Type 1 and Type 2.',
      fdaResponse:
        'Sample size adequate for primary endpoint. Recommend pre-specifying subgroup analysis for hypoglycemia (<70 mg/dL) — current SAP only includes overall MARD. FDA will not accept post-hoc subgroup claims.',
      status: 'answered',
      commitments: [
        {
          displayCode: 'cm-1142-3',
          text: 'Amend SAP to pre-specify hypo-MARD subgroup',
          dossierLink: { kind: 'k510-section', label: 'eSTAR §11 — Performance', sectionId: '11' },
          rolledIn: false,
          blocker: true,
        },
      ],
    },
    {
      n: 4,
      q: 'Do we need a separate human factors validation given BX-204 is intended for self-use by Type 2 diabetic patients ≥18?',
      ourPosition: 'HF validation per IEC 62366-1 against the intended user profile is planned (n=15 per group).',
      fdaResponse:
        'HF validation is required per FDA HF guidance (Feb 2016). Sample size and methodology proposed are acceptable. Confirm task list maps to the use-related risk analysis from §10.',
      status: 'answered',
      commitments: [],
    },
    {
      n: 5,
      q: 'Is a clinical claim of "complementary use with insulin therapy decisions" supportable, or should we restrict to "trend monitoring only"?',
      ourPosition: 'Prefer "complementary" framing, with caveat language about confirmatory fingerstick.',
      fdaResponse:
        'FDA cautions that "complementary to insulin therapy decisions" approaches a dosing claim and would require a separate IDE-supported study. Recommend "trend monitoring and pattern recognition; not for use in insulin dosing decisions" as labeled indication.',
      status: 'answered',
      commitments: [
        {
          displayCode: 'cm-1142-5',
          text: 'Restrict labeled indication per FDA recommendation',
          dossierLink: { kind: 'k510-section', label: 'eSTAR §3 — Indications for Use', sectionId: '3' },
          rolledIn: false,
        },
      ],
    },
  ],
  timeline: [
    { when: 'Jun 12', who: 'FDA',                what: 'Written meeting minutes received · 5 of 5 questions resolved', occurredAt: '2025-06-12T09:00Z' },
    { when: 'Jun 03', who: 'FDA · Dr. K. Patel', what: 'Meeting held · 58 minutes · 3 commitments captured',          occurredAt: '2025-06-03T14:00Z' },
    { when: 'May 27', who: 'Sponsor',            what: 'Pre-meeting briefing package supplied (35p)',                  occurredAt: '2025-05-27T10:00Z' },
    { when: 'Apr 19', who: 'FDA',                what: 'Meeting scheduled · Jun 03 · tele · OHT2',                     occurredAt: '2025-04-19T09:00Z' },
    { when: 'Apr 02', who: 'FDA',                what: 'Acknowledgement letter · Q251142 · review clock started',      occurredAt: '2025-04-02T09:00Z' },
    { when: 'Mar 14', who: 'M. Webb',            what: 'Transmitted via ESG · receipt 251142-rcpt',                    occurredAt: '2025-03-14T16:00Z' },
    { when: 'Mar 11', who: 'L. Tran',            what: 'Cover letter signed (DocuSign)',                               occurredAt: '2025-03-11T17:00Z' },
    { when: 'Mar 09', who: 'J. Chen',            what: 'Q-Sub package locked · 5 questions · 23 pages',                occurredAt: '2025-03-09T18:00Z' },
  ],
};

// Q250987 — OR-801 fatigue waiver (await, no commitments yet).
const QSUB_0987 = {
  id: QSUB.q0987,
  programId: PROG.OR_801,
  qNumber: 'Q250987',
  qSubType: 'presub',
  title: 'Performance testing waiver — fatigue ASTM F1717',
  stage: 'await',
  daysIn: 52,
  filedAt: '2025-02-04',
  targetDate: '2025-04-20',
  fdaTeam: 'OHT6 — Orthopedic',
  tone: 'warn',
  summary:
    'OR-801 requested a fatigue testing waiver based on equivalence to predicate K191822 — same alloy, identical thread geometry, validated dynamic compression bending data on file. Filed Feb 4, 75-day target Apr 20.',
  meeting: null,
  questions: [
    {
      n: 1,
      q: 'Does FDA agree that fatigue testing per ASTM F1717 may be waived given equivalence to K191822 (same Ti-6Al-4V ELI, same thread geometry, same surface treatment)?',
      ourPosition:
        'Identical alloy spec ASTM F136. Thread geometry from K191822 reused. Dynamic compression bending data on file from supplier qualification.',
      fdaResponse: null,
      status: 'awaiting',
      commitments: [],
    },
    {
      n: 2,
      q: 'If full ASTM F1717 is required, is reduced-sample testing (n=5 per worst-case configuration vs n=10) acceptable?',
      ourPosition: 'Worst-case construct identified by FEA · Tier-1 sites only.',
      fdaResponse: null,
      status: 'awaiting',
      commitments: [],
    },
    {
      n: 3,
      q: 'Are the proposed worst-case constructs (5.5mm × 50mm and 7.5mm × 90mm) sufficient, or does FDA require additional configurations?',
      ourPosition: 'FEA-driven selection. Smallest and largest within the indicated range.',
      fdaResponse: null,
      status: 'awaiting',
      commitments: [],
    },
  ],
  timeline: [
    { when: 'Feb 11', who: 'FDA',     what: 'Acknowledgement letter · Q250987 · review clock started', occurredAt: '2025-02-11T09:00Z' },
    { when: 'Feb 04', who: 'M. Webb', what: 'Transmitted via ESG · receipt 250987-rcpt',               occurredAt: '2025-02-04T15:00Z' },
    { when: 'Feb 03', who: 'L. Tran', what: 'Cover letter signed',                                     occurredAt: '2025-02-03T16:00Z' },
    { when: 'Feb 01', who: 'J. Chen', what: 'Q-Sub package locked · 3 questions · 17 pages',           occurredAt: '2025-02-01T18:00Z' },
  ],
};

// Q250844 — OR-801 SIR mid-review (feedback received, 1 commitment rolled in).
const QSUB_0844 = {
  id: QSUB.q0844,
  programId: PROG.OR_801,
  qNumber: 'Q250844',
  qSubType: 'sir',
  title: 'AI request — biocompatibility extractables data',
  stage: 'feedback',
  daysIn: 11,
  filedAt: '2025-01-22',
  targetDate: '2025-04-07',
  fdaTeam: 'OHT6 — Orthopedic',
  tone: 'ok',
  summary:
    'Mid-review Submission Issue Request raised after FDA AI letter on the OR-801 510(k). FDA asked for extractables and leachables under ISO 10993-18. Response received, supplier-tested data accepted with a documentation update.',
  meeting: null,
  questions: [
    {
      n: 1,
      q: 'Will supplier-provided extractables data per ISO 10993-18 (worst-case extraction, GC-MS) be acceptable, or does FDA require a finished-device chemical characterization?',
      ourPosition: 'Material is identical to predicate. Supplier data tied to lot 22K with chain of custody.',
      fdaResponse:
        'Supplier extractables data is acceptable for the OR-801 device given identical alloy and surface treatment. Sponsor must include the supplier qualification audit trail and confirm lot-traceability in the test article statement.',
      status: 'answered',
      commitments: [
        {
          displayCode: 'cm-844-1',
          text: 'Add lot-traceability statement and supplier audit trail to §15 — Biocompatibility',
          dossierLink: { kind: 'k510-section', label: 'eSTAR §15', sectionId: '15' },
          rolledIn: true,
        },
      ],
    },
    {
      n: 2,
      q: 'Does FDA require a 90-day extraction (instead of 24h) for chronic implant scoring?',
      ourPosition: 'Predicate cleared with 24h extraction. Implant duration <30 days per labeling.',
      fdaResponse:
        '24-hour extraction acceptable. Confirm clinical exposure duration in §3 matches the biocompatibility test article statement.',
      status: 'answered',
      commitments: [],
    },
  ],
  timeline: [
    { when: 'Apr 03', who: 'FDA',     what: 'Written response received · 2 of 2 questions resolved', occurredAt: '2025-04-03T09:00Z' },
    { when: 'Feb 28', who: 'FDA',     what: 'Acknowledgement · Q250844 · review clock started',      occurredAt: '2025-02-28T09:00Z' },
    { when: 'Jan 22', who: 'M. Webb', what: 'Transmitted via ESG · receipt 250844-rcpt',             occurredAt: '2025-01-22T15:00Z' },
  ],
};

// Q251331 — RX-340 packaging stage (no q_number yet).
const QSUB_1331 = {
  id: QSUB.q1331,
  programId: PROG.RX_340,
  qNumber: null,
  qSubType: 'presub',
  title: 'Predicate determination · K224182 vs K231901',
  stage: 'package',
  daysIn: 6,
  filedAt: null,
  targetDate: null,
  fdaTeam: 'OHT4 — Surgical',
  tone: '',
  summary: 'Predicate determination Pre-Sub being assembled — 4 questions drafted, 23 pages of device description in review.',
  meeting: null,
  questions: [
    { n: 1, q: 'Does FDA agree K224182 (powered stapler) is a suitable primary predicate over K231901 (manual)?', ourPosition: 'Same intended use; powered actuation matches the candidate device.', fdaResponse: null, status: 'awaiting', commitments: [] },
    { n: 2, q: 'Are the cartridge cycle counts proposed for fatigue (5,000) sufficient for an indicated 250-cycle reuse pattern?', ourPosition: 'Worst-case scenario. 20× the indicated reuse.', fdaResponse: null, status: 'awaiting', commitments: [] },
    { n: 3, q: 'Is benchtop-only firing performance acceptable, or are animal studies required?', ourPosition: 'Predicate cleared on benchtop. Identical firing mechanism.', fdaResponse: null, status: 'awaiting', commitments: [] },
    { n: 4, q: 'Does the cybersecurity SBOM submitted via §17 cover the firmware sufficiently?', ourPosition: 'SBOM matches Premarket guidance Sep 2023.', fdaResponse: null, status: 'awaiting', commitments: [] },
  ],
  timeline: [
    { when: 'Apr 24', who: 'J. Chen', what: 'Pre-Sub package draft locked for review', occurredAt: '2025-04-24T15:00Z' },
  ],
};

// Q251187 — PM-660 SBOM cybersecurity scope (await).
const QSUB_1187 = {
  id: QSUB.q1187,
  programId: PROG.PM_660,
  qNumber: 'Q251187',
  qSubType: 'presub',
  title: 'Cybersecurity premarket scope · SBOM evidence',
  stage: 'await',
  daysIn: 23,
  filedAt: '2025-03-06',
  targetDate: '2025-05-20',
  fdaTeam: 'OHT2 — Cardiac',
  tone: '',
  summary: 'Sponsor requested FDA agreement on the cybersecurity SBOM scope for a SaMD patient monitor.',
  meeting: null,
  questions: [
    { n: 1, q: 'Does FDA agree the SBOM scope covers all in-scope third-party libraries?', ourPosition: 'SPDX 2.3 SBOM with vulnerability mapping.', fdaResponse: null, status: 'awaiting', commitments: [] },
    { n: 2, q: 'Are the threat-model artifacts sufficient given the local-only network architecture?', ourPosition: 'STRIDE-based threat model with mitigation trace.', fdaResponse: null, status: 'awaiting', commitments: [] },
    { n: 3, q: 'Is the proposed coordinated-vulnerability-disclosure SOP acceptable?', ourPosition: 'Mirrors FDA premarket guidance Sep 2023.', fdaResponse: null, status: 'awaiting', commitments: [] },
    { n: 4, q: 'Does the post-market patching cadence need to be specified?', ourPosition: 'Quarterly + emergency patches.', fdaResponse: null, status: 'awaiting', commitments: [] },
    { n: 5, q: 'Are the proposed pen-test scopes adequate?', ourPosition: 'Black-box + grey-box per CWE top 25.', fdaResponse: null, status: 'awaiting', commitments: [] },
    { n: 6, q: 'Will FDA require third-party attestation of the SBOM?', ourPosition: 'Internal QA-validated supply.', fdaResponse: null, status: 'awaiting', commitments: [] },
  ],
  timeline: [
    { when: 'Mar 13', who: 'FDA',     what: 'Acknowledgement · Q251187', occurredAt: '2025-03-13T09:00Z' },
    { when: 'Mar 06', who: 'M. Webb', what: 'Transmitted via ESG',       occurredAt: '2025-03-06T15:00Z' },
  ],
};

// Q251402 — NM-512 SRD plan stage (no q_number).
const QSUB_1402 = {
  id: QSUB.q1402,
  programId: PROG.NM_512,
  qNumber: null,
  qSubType: 'srd',
  title: 'IDE applicability — chronic implantation feasibility',
  stage: 'plan',
  daysIn: 2,
  filedAt: null,
  targetDate: null,
  fdaTeam: 'OHT5 — Neurostim',
  tone: '',
  summary: 'Sponsor evaluating IDE applicability for the chronic implantation feasibility study.',
  meeting: null,
  questions: [
    { n: 1, q: 'Does the proposed first-in-human feasibility study qualify as non-significant risk?', ourPosition: 'Acute placement, removed at 7d, no chronic implant.', fdaResponse: null, status: 'awaiting', commitments: [] },
  ],
  timeline: [],
};

// Q240721 — BX-204 integrate stage (closed). Used to demo "rolled-in" history.
const QSUB_0721 = {
  id: QSUB.q0721,
  programId: PROG.BX_204,
  qNumber: 'Q240721',
  qSubType: 'presub',
  title: 'Clinical study design · accuracy endpoint',
  stage: 'integrate',
  daysIn: 18,
  filedAt: '2024-09-10',
  targetDate: '2024-11-25',
  fdaTeam: 'OHT2 — Diabetes',
  tone: 'ok',
  summary: 'Earlier Pre-Sub closed and integrated. Five commitments captured, all rolled in to the dossier.',
  meeting: { date: '2024-12-02', kind: 'In-person · 90 min', team: 'Dr. K. Patel (DDH/OHT2)', confirmed: true },
  questions: [
    {
      n: 1,
      q: 'Is the accuracy endpoint definition (MARD ≤ 9.5%) appropriate?',
      ourPosition: 'Aligned with predicate K212284.',
      fdaResponse: 'Acceptable for the primary endpoint.',
      status: 'answered',
      commitments: [
        { displayCode: 'cm-721-1', text: 'Lock SAP at protocol freeze', dossierLink: { kind: 'k510-section', label: 'eSTAR §11 — SAP', sectionId: '11' }, rolledIn: true },
      ],
    },
    {
      n: 2,
      q: 'Does the proposed cohort (n=156) cover both Type 1 and Type 2 diabetics with sufficient power?',
      ourPosition: 'Power analysis: 0.85 for non-inferiority margin.',
      fdaResponse: 'Power analysis acceptable.',
      status: 'answered',
      commitments: [
        { displayCode: 'cm-721-2', text: 'Capture Type 1/Type 2 strata in the SAP', dossierLink: { kind: 'k510-section', label: 'eSTAR §11', sectionId: '11' }, rolledIn: true },
      ],
    },
    {
      n: 3,
      q: 'Is YSI an acceptable reference?',
      ourPosition: 'Industry-standard reference.',
      fdaResponse: 'YSI acceptable.',
      status: 'answered',
      commitments: [
        { displayCode: 'cm-721-3', text: 'Document YSI calibration regime', dossierLink: { kind: 'k510-section', label: 'eSTAR §11.4', sectionId: '11' }, rolledIn: true },
      ],
    },
    {
      n: 4,
      q: 'Should sensors be calibrated to capillary or venous blood glucose?',
      ourPosition: 'Capillary, matching the indicated use.',
      fdaResponse: 'Capillary calibration acceptable; document the procedure in §11.5.',
      status: 'answered',
      commitments: [
        { displayCode: 'cm-721-4', text: 'Document capillary calibration in §11.5', dossierLink: { kind: 'k510-section', label: 'eSTAR §11.5', sectionId: '11' }, rolledIn: true },
        { displayCode: 'cm-721-5', text: 'Add fingerstick procedure to user manual',  dossierLink: { kind: 'k510-section', label: 'eSTAR §10 — Labeling', sectionId: '10' }, rolledIn: true },
      ],
    },
  ],
  timeline: [
    { when: 'Dec 02', who: 'FDA · Dr. K. Patel', what: 'In-person meeting · 5 of 5 commitments captured', occurredAt: '2024-12-02T14:00Z' },
    { when: 'Sep 10', who: 'M. Webb',            what: 'Transmitted via ESG · receipt 240721-rcpt',       occurredAt: '2024-09-10T15:00Z' },
  ],
};

const QSUBS = [QSUB_1142, QSUB_0987, QSUB_0844, QSUB_1331, QSUB_1187, QSUB_1402, QSUB_0721];

// ── Main ────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  MDX BETA — programs + Q-Sub fixtures                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orgId = await getOrgId(client);
    console.log(`Org: concept2cure (id=${orgId})`);

    console.log(`[1/3] Programs (${PROGRAMS.length})…`);
    for (const p of PROGRAMS) {
      await upsertProgram(client, orgId, p.id, p);
      console.log(`   ✓ ${p.code} — ${p.name}`);
    }

    console.log(`[2/3] Q-Submissions (${QSUBS.length})…`);
    for (const q of QSUBS) {
      await upsertQSubmission(client, q.id, q);
      await upsertMeeting(client, q.id, q.meeting);
      await upsertQuestions(client, q.id, q.questions);
      await upsertTimeline(client, q.id, q.timeline);
      console.log(`   ✓ ${q.qNumber ?? '(no Q#)'} — ${q.title}`);
    }

    console.log('[3/3] Verifying counts…');
    const verify = await client.query(
      `SELECT
         (SELECT count(*) FROM regulatory_programs WHERE organization_id = $1) AS programs,
         (SELECT count(*) FROM q_submissions WHERE program_id IN (
            SELECT id::text FROM regulatory_programs WHERE organization_id = $1
          )) AS qsubs,
         (SELECT count(*) FROM q_sub_questions WHERE q_submission_id IN (
            SELECT id FROM q_submissions WHERE program_id IN (
              SELECT id::text FROM regulatory_programs WHERE organization_id = $1
            )
          )) AS questions,
         (SELECT count(*) FROM q_sub_commitments WHERE q_sub_question_id IN (
            SELECT q.id FROM q_sub_questions q
            JOIN q_submissions s ON s.id = q.q_submission_id
            JOIN regulatory_programs p ON p.id::text = s.program_id
            WHERE p.organization_id = $1
          )) AS commitments`,
      [orgId],
    );
    console.log(`   programs=${verify.rows[0].programs}, qsubs=${verify.rows[0].qsubs}, questions=${verify.rows[0].questions}, commitments=${verify.rows[0].commitments}`);

    await client.query('COMMIT');
    console.log('');
    console.log('✓ MDX BETA seed complete.');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
