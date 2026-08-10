/**
 * 10-risk.mjs — ISO 14971 risk management demo rows (GA demo seed, risk domain).
 *
 * Seeds the standalone risk module read by GET /api/mdx/risk-items
 * (server/routes/mdx-risk-management.ts):
 *
 *   risk_items    — hazard / harm rows for the BX-204 CGM program
 *                   (severity x probability on the 1..5 ISO 14971 scale;
 *                   initial_risk / residual_risk stored as the product)
 *   risk_controls — 1-2 ISO 14971 clause 7 controls per item
 *
 * Tenant scoping matches the route exactly: risk_items.organization_id
 * (integer) with deleted_at IS NULL; controls are fetched per item via
 * risk_controls.risk_item_id (risk_controls also carries organization_id,
 * used by the PATCH endpoint's tenant filter).
 *
 * Enum vocabulary comes from the route's zod schemas — the 20260507 DDL
 * stores plain text with no CHECK constraints:
 *   item status       open | mitigating | verified | accepted | closed
 *   source            fmea | pha | fault_tree | literature | complaint | capa | other
 *   control_strategy  design_eliminate | design_reduce | protective | information
 *   control_type      inherent_safety | protective_measure | information_safety
 *   control status    proposed | implemented | verified | effective
 *
 * Shape note: migrations/20260609_design_risk.sql declares a DIFFERENT
 * risk_items/risk_controls shape (uuid PK, rmf_id NOT NULL). Both migrations
 * use CREATE TABLE IF NOT EXISTS and 20260507 sorts first, so a database
 * migrated in order has the mdx shape this module targets — but we verify the
 * distinguishing columns before inserting and skip gracefully otherwise.
 *
 * rbm_risk_assessments is NOT referenced by these tables (it is the FK parent
 * of the separate rbm_* family only), so no handling is needed here.
 *
 * Idempotent: items keyed on (organization_id, ref_code), controls on
 * (risk_item_id, description) — SELECT-before-INSERT because neither table
 * has a natural unique constraint.
 */

/* Deterministic BX-204 program UUID — must match scripts/seed-mdx-beta.mjs
   PROG.BX_204 so both seeders converge on the same regulatory_programs row. */
const BX204_PROGRAM_ID = '11111111-2222-3333-4444-000000000204';

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  return Boolean(rows[0]?.t);
}

async function columnSet(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Set(rows.map((r) => r.column_name));
}

/* Resolve a user id for program leadership; fall back to admin. */
async function resolveUserId(client, email, admin) {
  const { rows } = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  return rows[0]?.id ?? admin.id;
}

/* Resolve (or create) the BX-204 CGM program so risk items carry a real
   program_id. Wrapped in a SAVEPOINT: a failed statement would otherwise
   abort the orchestrator's whole transaction (25P02). Falls back to a null
   program link — the main list read filters only on organization_id. */
async function resolveBx204ProgramId(client, org, admin) {
  if (!(await tableExists(client, 'regulatory_programs'))) {
    console.log('   ⚠ regulatory_programs not found — seeding risk items without a program link');
    return null;
  }
  const sel = `SELECT id FROM regulatory_programs
                WHERE organization_id = $1 AND code = 'BX-204' AND deleted_at IS NULL
                LIMIT 1`;
  try {
    await client.query('SAVEPOINT sp_risk_program');
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
    await client.query('RELEASE SAVEPOINT sp_risk_program');
    return rows[0]?.id ?? null;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_risk_program');
    console.log('   ⚠ could not resolve the BX-204 program — seeding risk items without a program link');
    return null;
  }
}

/* BX-204 CGM (10-day wear, adhesive patch + BLE transmitter) hazard analysis.
   residual* left null on the open item so the surface exercises the route's
   "(residual_risk IS NULL) DESC" ordering (unmitigated items sort first). */
const ITEMS = [
  {
    refCode: 'RISK-0001',
    hazard: 'Sensor bias in the hypoglycemic range',
    hazardousSituation: 'Patient relies on a CGM reading that over-reports glucose while actually hypoglycemic',
    harm: 'Severe hypoglycemia (loss of consciousness, seizure)',
    sequenceOfEvents: 'Electrochemical interference at low glucose concentrations biases the sensor high; the app displays a euglycemic value; the patient does not treat the low.',
    severity: 5, probability: 2, detectability: 2,
    residualSeverity: 5, residualProbability: 1,
    controlStrategy: 'design_reduce', acceptable: null, benefitRiskRationale: null,
    status: 'mitigating', source: 'fmea', assigned: true,
    createdDaysAgo: 88, updatedDaysAgo: 6,
    controls: [
      {
        description: 'Low-range calibration algorithm revision with lot-release acceptance criterion (MARD <= 8.5% for 40-80 mg/dL)',
        controlType: 'inherent_safety', status: 'implemented',
        implementationEvidence: 'Algorithm design specification ALG-DS-012 rev C',
      },
      {
        description: 'Blood-glucose confirmation prompt before treatment decisions when the displayed value is below 70 mg/dL',
        controlType: 'protective_measure', status: 'verified',
        implementationEvidence: 'App requirement APP-REQ-118',
        verificationEvidence: 'Verification report TR-204-118',
      },
    ],
  },
  {
    refCode: 'RISK-0002',
    hazard: 'Loss of transmitter-to-display data connection',
    hazardousSituation: 'Glucose alerts are not delivered while the patient is asleep or away from the display device',
    harm: 'Delayed treatment of hypoglycemia or hyperglycemia',
    sequenceOfEvents: 'Bluetooth link drops without the user noticing; no readings or alerts are received until reconnection.',
    severity: 4, probability: 3, detectability: 3,
    residualSeverity: 4, residualProbability: 1,
    controlStrategy: 'protective', acceptable: true,
    benefitRiskRationale: 'Residual probability of a missed alert is remote after the signal-loss alarm; the benefit of continuous monitoring substantially outweighs the residual risk compared with intermittent self-monitoring.',
    status: 'verified', source: 'fmea', assigned: true,
    createdDaysAgo: 84, updatedDaysAgo: 12,
    controls: [
      {
        description: 'Signal-loss alarm on the display device after 20 minutes without sensor data',
        controlType: 'protective_measure', status: 'effective',
        implementationEvidence: 'Alert design specification ALR-204-004',
        verificationEvidence: 'Verification report TR-204-092',
        effectivenessEvidence: 'Post-market complaint trend review 2026-Q1 shows no missed-alert events attributable to undetected signal loss',
      },
      {
        description: 'Transmitter buffers 8 hours of readings and backfills automatically on reconnection',
        controlType: 'inherent_safety', status: 'verified',
        verificationEvidence: 'Integration test report TR-204-064',
      },
    ],
  },
  {
    refCode: 'RISK-0003',
    hazard: 'Skin-contact adhesive sensitization',
    hazardousSituation: 'Prolonged wear of the sensor patch on sensitized skin',
    harm: 'Contact dermatitis at the wear site',
    sequenceOfEvents: 'Repeated 10-day wear cycles on the same site expose skin to adhesive components; localized irritation progresses to dermatitis.',
    severity: 2, probability: 3, detectability: 4,
    residualSeverity: 2, residualProbability: 2,
    controlStrategy: 'information', acceptable: true, benefitRiskRationale: null,
    status: 'accepted', source: 'complaint', assigned: false,
    createdDaysAgo: 80, updatedDaysAgo: 21,
    controls: [
      {
        description: 'Adhesive qualified per the ISO 10993-5, -10 and -23 biocompatibility battery',
        controlType: 'inherent_safety', status: 'effective',
        implementationEvidence: 'Biocompatibility evaluation report BIO-204-001',
        effectivenessEvidence: 'No sensitization signal in 2025-2026 complaint trending',
      },
      {
        description: 'IFU instruction to rotate application sites and discontinue use if persistent erythema occurs',
        controlType: 'information_safety', status: 'implemented',
        implementationEvidence: 'IFU-204 rev D, section 4.2',
      },
    ],
  },
  {
    refCode: 'RISK-0004',
    hazard: 'Microbial contamination during sensor insertion',
    hazardousSituation: 'Sensor filament introduced through non-intact skin with a compromised applicator',
    harm: 'Local skin-site infection',
    sequenceOfEvents: 'Applicator sterility is compromised before use; insertion carries organisms into subcutaneous tissue.',
    severity: 3, probability: 2, detectability: 3,
    residualSeverity: 3, residualProbability: 1,
    controlStrategy: 'design_reduce', acceptable: true, benefitRiskRationale: null,
    status: 'verified', source: 'pha', assigned: false,
    createdDaysAgo: 76, updatedDaysAgo: 18,
    controls: [
      {
        description: 'Single-use sterile applicator with automatic needle retraction (EO sterilized, SAL 10^-6)',
        controlType: 'inherent_safety', status: 'verified',
        implementationEvidence: 'Sterilization validation VAL-204-STE-002',
        verificationEvidence: 'Sterility test report per ISO 11135',
      },
      {
        description: 'IFU aseptic insertion instructions with site-preparation pictograms',
        controlType: 'information_safety', status: 'implemented',
        implementationEvidence: 'IFU-204 rev D, section 3.1',
      },
    ],
  },
  {
    refCode: 'RISK-0005',
    hazard: 'Predictive low-glucose alert fails to trigger (false negative)',
    hazardousSituation: 'Patient trusts the predictive alert feature and does not confirm a falling glucose trend before sleep',
    harm: 'Nocturnal severe hypoglycemia',
    sequenceOfEvents: 'A rapid glucose decline outside the algorithm training envelope is not classified as an impending low; no predictive alert fires; the threshold alarm becomes the only remaining barrier.',
    severity: 4, probability: 3, detectability: 2,
    residualSeverity: null, residualProbability: null,
    controlStrategy: null, acceptable: null, benefitRiskRationale: null,
    status: 'open', source: 'pha', assigned: true,
    createdDaysAgo: 9, updatedDaysAgo: 2,
    controls: [
      {
        description: 'Retrain the predictive-alert model on an expanded hypoglycemia dataset before feature release (change CH-118)',
        controlType: 'inherent_safety', status: 'proposed',
      },
    ],
  },
  {
    refCode: 'RISK-0006',
    hazard: 'Unauthorized wireless access to the transmitter',
    hazardousSituation: 'An attacker within radio range pairs to the transmitter and injects falsified glucose values',
    harm: 'Insulin dosing error leading to severe hypoglycemia',
    sequenceOfEvents: 'Weak pairing controls allow a rogue device to impersonate the display app; falsified readings drive an incorrect bolus decision.',
    severity: 5, probability: 2, detectability: 2,
    residualSeverity: 5, residualProbability: 1,
    controlStrategy: 'protective', acceptable: null, benefitRiskRationale: null,
    status: 'mitigating', source: 'fault_tree', assigned: true,
    createdDaysAgo: 45, updatedDaysAgo: 4,
    controls: [
      {
        description: 'BLE LE Secure Connections pairing with application-layer AES-256-GCM message authentication',
        controlType: 'protective_measure', status: 'implemented',
        implementationEvidence: 'Cybersecurity design document SEC-204-002',
      },
      {
        description: 'Annual penetration test of the transmitter-app interface by an external laboratory',
        controlType: 'protective_measure', status: 'proposed',
      },
    ],
  },
  {
    refCode: 'RISK-0007',
    hazard: 'Sensor accuracy drift beyond specification at end of wear period',
    hazardousSituation: 'Readings taken near the end of the 10-day wear period are used for dosing decisions',
    harm: 'Incorrect insulin dose from an out-of-specification reading',
    sequenceOfEvents: 'Enzyme depletion degrades sensitivity late in the wear period; MARD exceeds the labeled specification while readings continue to display.',
    severity: 3, probability: 3, detectability: 3,
    residualSeverity: 3, residualProbability: 1,
    controlStrategy: 'design_eliminate', acceptable: true, benefitRiskRationale: null,
    status: 'verified', source: 'fmea', assigned: true,
    createdDaysAgo: 70, updatedDaysAgo: 15,
    controls: [
      {
        description: 'Automatic sensor session termination at 240 hours with a 24-hour advance replacement notification',
        controlType: 'inherent_safety', status: 'effective',
        implementationEvidence: 'Firmware requirement FW-REQ-077',
        verificationEvidence: 'Verification report TR-204-101',
        effectivenessEvidence: 'Session-length telemetry confirms zero readings delivered past 240 hours',
      },
    ],
  },
  {
    refCode: 'RISK-0008',
    hazard: 'Pressure-induced sensor attenuation (compression low)',
    hazardousSituation: 'Patient sleeps on the sensor site, producing transient false low readings and alarms',
    harm: 'Alarm fatigue leading to ignored true hypoglycemia alarms',
    sequenceOfEvents: 'Local tissue compression reduces interstitial perfusion; readings dip below the alarm threshold; repeated nightly false alarms desensitize the user.',
    severity: 2, probability: 4, detectability: 3,
    residualSeverity: 2, residualProbability: 3,
    controlStrategy: 'information', acceptable: true, benefitRiskRationale: null,
    status: 'accepted', source: 'complaint', assigned: false,
    createdDaysAgo: 33, updatedDaysAgo: 8,
    controls: [
      {
        description: 'IFU guidance to select application sites away from preferred sleeping positions',
        controlType: 'information_safety', status: 'implemented',
        implementationEvidence: 'IFU-204 rev D, section 3.2',
      },
    ],
  },
  {
    refCode: 'RISK-0009',
    hazard: 'Glucose unit-of-measure confusion (mg/dL vs mmol/L)',
    hazardousSituation: 'Display configured for a different unit convention than the user expects',
    harm: 'Gross insulin dosing error',
    sequenceOfEvents: 'A device configured for mmol/L is interpreted as mg/dL; the numeric value is misread by an order of magnitude.',
    severity: 5, probability: 1, detectability: 4,
    residualSeverity: 5, residualProbability: 1,
    controlStrategy: 'design_eliminate', acceptable: true, benefitRiskRationale: null,
    status: 'closed', source: 'literature', assigned: false,
    createdDaysAgo: 120, updatedDaysAgo: 60,
    controls: [
      {
        description: 'Display units locked to the regional configuration at manufacture and not user-modifiable',
        controlType: 'inherent_safety', status: 'effective',
        implementationEvidence: 'System requirement SYS-REQ-021',
        verificationEvidence: 'Design verification report TR-204-055',
        effectivenessEvidence: 'Human-factors validation HF-204-003 confirmed correct unit interpretation across all participants',
      },
    ],
  },
];

export default async function seed(client, { org, admin }) {
  if (!(await tableExists(client, 'risk_items'))) {
    console.log('   ⚠ risk_items not found — skipping');
    return;
  }
  const itemCols = await columnSet(client, 'risk_items');
  const mdxShape = ['organization_id', 'ref_code', 'severity', 'probability', 'status']
    .every((c) => itemCols.has(c));
  if (!mdxShape) {
    console.log('   ⚠ risk_items lacks the mdx (20260507) shape — found the design-risk variant, skipping');
    return;
  }

  let controlsAvailable = false;
  if (!(await tableExists(client, 'risk_controls'))) {
    console.log('   ⚠ risk_controls not found — seeding risk items only');
  } else {
    const ctrlCols = await columnSet(client, 'risk_controls');
    controlsAvailable = ['risk_item_id', 'organization_id', 'control_type', 'status']
      .every((c) => ctrlCols.has(c));
    if (!controlsAvailable) {
      console.log('   ⚠ risk_controls lacks the mdx (20260507) shape — seeding risk items only');
    }
  }

  const programId = await resolveBx204ProgramId(client, org, admin);

  let itemsInserted = 0;
  let itemsExisting = 0;
  let controlsInserted = 0;

  for (const it of ITEMS) {
    const found = await client.query(
      `SELECT id FROM risk_items
        WHERE organization_id = $1 AND ref_code = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [org.id, it.refCode],
    );
    let itemId = found.rows[0]?.id;
    if (itemId) {
      itemsExisting += 1;
    } else {
      const residualRisk =
        it.residualSeverity != null && it.residualProbability != null
          ? it.residualSeverity * it.residualProbability
          : null;
      const ins = await client.query(
        `INSERT INTO risk_items (
           organization_id, program_id, ref_code, hazard, hazardous_situation, harm,
           sequence_of_events, severity, probability, detectability, initial_risk,
           residual_severity, residual_probability, residual_risk, control_strategy,
           acceptable, benefit_risk_rationale, status, source, assigned_to,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
           $16, $17, $18, $19, $20,
           NOW() - ($21 * interval '1 day'), NOW() - ($22 * interval '1 day')
         )
         RETURNING id`,
        [
          org.id, programId, it.refCode, it.hazard, it.hazardousSituation, it.harm,
          it.sequenceOfEvents, it.severity, it.probability, it.detectability,
          it.severity * it.probability,
          it.residualSeverity, it.residualProbability, residualRisk, it.controlStrategy,
          it.acceptable, it.benefitRiskRationale, it.status, it.source,
          it.assigned ? admin.id : null,
          it.createdDaysAgo, it.updatedDaysAgo,
        ],
      );
      itemId = ins.rows[0].id;
      itemsInserted += 1;
    }

    if (!controlsAvailable) continue;
    for (const c of it.controls) {
      const ctrlFound = await client.query(
        `SELECT id FROM risk_controls WHERE risk_item_id = $1 AND description = $2 LIMIT 1`,
        [itemId, c.description],
      );
      if (ctrlFound.rows[0]) continue;
      await client.query(
        `INSERT INTO risk_controls (
           risk_item_id, organization_id, description, control_type,
           implementation_evidence, verification_evidence, effectiveness_evidence,
           introduces_new_risk, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)`,
        [
          itemId, org.id, c.description, c.controlType,
          c.implementationEvidence ?? null, c.verificationEvidence ?? null,
          c.effectivenessEvidence ?? null, c.status,
        ],
      );
      controlsInserted += 1;
    }
  }

  const skippedNote = itemsExisting > 0 ? ` (${itemsExisting} already present)` : '';
  console.log(
    `   ✓ risk: ${itemsInserted} risk items + ${controlsInserted} controls seeded for BX-204 CGM${skippedNote}`,
  );
}
