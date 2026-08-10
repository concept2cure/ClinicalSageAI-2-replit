/**
 * 40-submission-udi.mjs — GA demo seed: submission gateway transmittals + UDI records.
 *
 * Surfaces fed by this module:
 *   1. GET /api/mdx/gateways/transmittals (server/routes/mdx-submission-gateway.ts:115)
 *      → SELECT id, organization_id, program_id, package_id, region, gateway, format,
 *               submission_type, transport, transmission_id, status, http_status,
 *               error_class, error_message, bundle_size_bytes, submitted_by, submitted_at,
 *               ack_received_at, completed_at, metadata
 *          FROM submission_transmittals WHERE organization_id = $org
 *         ORDER BY submitted_at DESC
 *      GET /api/mdx/gateways/transmittals/:id (same file, :149) additionally reads
 *      SELECT * FROM submission_validation_findings
 *       WHERE transmittal_id = $1 AND organization_id = $2
 *       ORDER BY (severity='error') DESC, (severity='warning') DESC, id
 *      GET /api/mdx/analytics/* (server/routes/mdx-analytics.ts:81,100) aggregates the
 *      same rows by status / region / error_class, so the fixture spreads those values.
 *   2. GET /api/mdx/udi (server/routes/mdx-udi.ts:81)
 *      → SELECT * FROM udi_records
 *         WHERE organization_id = $org AND deleted_at IS NULL
 *         ORDER BY updated_at DESC
 *      (mdx-search.ts:222 also fans out over device_name / udi_di / product_code.)
 *
 * DDL sources:
 *   migrations/20260509_submission_gateways.sql   (submission_transmittals,
 *                                                  submission_validation_findings)
 *   migrations/20260507_mdx_beta_surfaces.sql +
 *   migrations/20260524_udi_records.sql           (udi_records; shared/schema.ts mirrors it)
 *
 * Tenant scoping matches the routes exactly: organization_id (integer) on all
 * three tables; udi_records additionally soft-deletes via deleted_at.
 *
 * Vocabulary comes from the routes + DDL comments (plain text, no CHECKs):
 *   region   fda | ema | pmda | ca                  (route REGION_SET)
 *   gateway  esg | cesp | eudamed | pmda_gateway | hc_cesg   (route GATEWAY_SET)
 *   format   ectd | estar | eudamed_register | pmda_ectd
 *   status   pending | in_transit | received | rejected | rolled_back |
 *            ack1_received | ack2_received | ack3_received | validation_passed |
 *            validation_failed | review_started | response_required | completed
 *   error_class  auth | transport | validation | gateway | timeout
 *   findings.severity  error | warning | info
 *   udi issuing_agency GS1 | HIBCC | ICCBBA; gudid_status draft | submitted |
 *            published | rejected; mri_safety mri_safe | mri_conditional |
 *            mri_unsafe | not_evaluated; lot_serial lot | serial | none
 *
 * Idempotency: transmittals carry a stable metadata.seed_key (no natural unique
 * column — transmission_id can be null mid-flight) and are SELECT-before-INSERT
 * on (organization_id, metadata->>'seed_key'). Findings key on
 * (transmittal_id, message). UDI records key on (organization_id, udi_di) with
 * deleted_at IS NULL — matching udi_records_org_di_uniq where that partial
 * unique index exists (20260507 shape; the drizzle-pushed shape has no unique,
 * so SELECT-before-INSERT covers both).
 *
 * Constraint note: 20260629_submission_transmittals_active_lock.sql allows only
 * one active (pending|in_transit|received) row per (organization_id, package_id,
 * bundle_sha256). Seeded rows keep package_id NULL and use distinct sha256
 * values per bundle, so the partial index is never violated.
 */

/* Deterministic BX-204 program UUID — must match scripts/seed-mdx-beta.mjs
   PROG.BX_204 and scripts/seed/ga-demo.d/10-risk.mjs so every seeder converges
   on the same regulatory_programs row. */
const BX204_PROGRAM_ID = '11111111-2222-3333-4444-000000000204';

const H = `interval '1 hour'`;

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  return Boolean(rows[0]?.t);
}

/* Resolve a user id for program leadership; fall back to admin. */
async function resolveUserId(client, email, admin) {
  const { rows } = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  return rows[0]?.id ?? admin.id;
}

/* Resolve (or create) the BX-204 CGM program so device rows carry a real
   program_id. Wrapped in a SAVEPOINT: a failed statement would otherwise abort
   the orchestrator's whole transaction (25P02). Falls back to a null program
   link — both list reads filter only on organization_id. */
async function resolveBx204ProgramId(client, org, admin) {
  if (!(await tableExists(client, 'regulatory_programs'))) {
    console.log('   ⚠ regulatory_programs not found — seeding without a program link');
    return null;
  }
  const sel = `SELECT id FROM regulatory_programs
                WHERE organization_id = $1 AND code = 'BX-204' AND deleted_at IS NULL
                LIMIT 1`;
  try {
    await client.query('SAVEPOINT sp_subudi_program');
    let { rows } = await client.query(sel, [org.id]);
    if (!rows[0]) {
      const leadUserId = await resolveUserId(client, 'admin@concept2cure.pro', admin);
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
    await client.query('RELEASE SAVEPOINT sp_subudi_program');
    return rows[0]?.id ?? null;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_subudi_program');
    console.log('   ⚠ could not resolve the BX-204 program — seeding without a program link');
    return null;
  }
}

/* Prefer the seeded VP Regulatory Affairs as the submitting user (created by
   the parent script's team step); fall back to the admin. users always exists
   here — the parent script resolved admin.id from it in this transaction. */
async function resolveSubmitterId(client, admin) {
  const { rows } = await client.query(
    `SELECT id FROM users WHERE email = 'sarah.chen@concept2cure.pro' LIMIT 1`,
  );
  return rows[0]?.id ?? admin.id;
}

/* ── Transmittal fixture ─────────────────────────────────────────────────────
   One row per transmit attempt (retries chain via parentKey). Hours-ago offsets
   keep the demo timeline fresh relative to seed time. */
const TRANSMITTALS = [
  {
    key: 'bx204-510k-original-0000',
    program: 'BX-204',
    region: 'fda', gateway: 'esg', format: 'estar', submissionType: 'original', transport: 'as2',
    bundlePath: '/vault/gateway-bundles/bx204/BX204-510k-original-estar-0000.zip',
    bundleSha256: '7c5d8536957e7de13150e34aa54095a9475ae0a066e566c15368f19b98eec44d',
    bundleSizeBytes: 48236544,
    transmissionId: 'MDN-20260601-000084413',
    status: 'review_started',
    submittedHoursAgo: 1080, ackHoursAgo: 1078,
    metadata: { product: 'BX-204 CGM', application: 'Traditional 510(k)', sequence: '0000', estar_version: '5.1' },
    findings: [
      {
        validator: 'fda_evalidator', severity: 'warning',
        ruleId: 'ESTAR-1322', ruleTitle: 'Referenced attachment missing from index',
        message: 'Section 13 references biocompatibility evaluation report BIO-204-001 but the attachment index does not include it.',
        filePath: 'estar/section-13-biocompatibility.pdf',
        createdHoursAgo: 1084, resolved: true, resolvedHoursAgo: 1082,
        resolutionNote: 'Attachment added and the package re-indexed prior to transmission.',
      },
      {
        validator: 'fda_evalidator', severity: 'info',
        ruleId: 'ESTAR-0007', ruleTitle: 'Optional section not populated',
        message: 'Optional predicate marketing-history narrative left blank; no impact on refuse-to-accept screening.',
        filePath: null,
        createdHoursAgo: 1084, resolved: false,
      },
    ],
  },
  {
    key: 'bx204-special510k-ch118-attempt1',
    program: 'BX-204',
    region: 'fda', gateway: 'esg', format: 'estar', submissionType: 'amendment', transport: 'as2',
    bundlePath: '/vault/gateway-bundles/bx204/BX204-special-510k-ch118-estar.zip',
    bundleSha256: '44fcb36d1bf5b963b77847e76460b1a78c0c9d8bc9fc4e741564f9483899303f',
    bundleSizeBytes: 21474836,
    transmissionId: null,
    status: 'rejected', errorClass: 'timeout',
    errorMessage: 'AS2 MDN was not received within the 4-hour window; the ESG session timed out during upload. Retry initiated.',
    submittedHoursAgo: 26,
    metadata: { product: 'BX-204 CGM', application: 'Special 510(k) — CH-118 predictive-low alert', sequence: '0001', attempt: 1 },
    findings: [],
  },
  {
    key: 'bx204-special510k-ch118-retry',
    parentKey: 'bx204-special510k-ch118-attempt1',
    program: 'BX-204',
    region: 'fda', gateway: 'esg', format: 'estar', submissionType: 'amendment', transport: 'as2',
    bundlePath: '/vault/gateway-bundles/bx204/BX204-special-510k-ch118-estar.zip',
    bundleSha256: 'f9bd363ed75fea0a9695c8a7a88bf0e66bd90df5df72bdbc1d1329971f9bc96a',
    bundleSizeBytes: 21474836,
    transmissionId: null,
    status: 'in_transit',
    submittedHoursAgo: 3,
    metadata: { product: 'BX-204 CGM', application: 'Special 510(k) — CH-118 predictive-low alert', sequence: '0001', attempt: 2 },
    findings: [
      {
        validator: 'internal', severity: 'info',
        ruleId: null, ruleTitle: 'Pre-flight bundle integrity check',
        message: 'Pre-flight bundle integrity check passed: 412 files verified against the checksum manifest before retransmission.',
        filePath: null,
        createdHoursAgo: 3, resolved: false,
      },
    ],
  },
  {
    key: 'bx204-eudamed-registration',
    program: 'BX-204',
    region: 'ema', gateway: 'eudamed', format: 'eudamed_register', submissionType: 'original', transport: 'rest',
    bundlePath: '/vault/gateway-bundles/bx204/BX204-eudamed-udi-device-registration.json',
    bundleSha256: 'd5564357aacd3d497c36fd1544b37ee6a508d70dfe6da6c69cf330cdd1bd1d41',
    bundleSizeBytes: 18432,
    transmissionId: 'EUDAMED-REG-2026-0004821',
    status: 'completed', httpStatus: 201,
    submittedHoursAgo: 1440, ackHoursAgo: 1439, completedHoursAgo: 1436,
    metadata: { product: 'BX-204 CGM', application: 'EUDAMED UDI/device registration', scope: 'Basic UDI-DI group (5 device identifiers)' },
    findings: [
      {
        validator: 'internal', severity: 'info',
        ruleId: 'BR-UDID-021', ruleTitle: 'EUDAMED business rule check',
        message: 'Basic UDI-DI group validated against EUDAMED business rules; all five device identifiers accepted on first pass.',
        filePath: null,
        createdHoursAgo: 1440, resolved: false,
      },
    ],
  },
  {
    key: 'bx099-maa-original-0000',
    program: null,
    region: 'ema', gateway: 'cesp', format: 'ectd', submissionType: 'original', transport: 'sftp',
    bundlePath: '/vault/gateway-bundles/bx099/BX099-maa-seq-0000.zip',
    bundleSha256: 'ab9eaa410fa51a6b1b6fc76451c27416cf0acadcb01a7b4cae49bc633d3e21ed',
    bundleSizeBytes: 1395864371,
    transmissionId: 'CESP-BSK-2026-118842',
    status: 'received',
    submittedHoursAgo: 504, ackHoursAgo: 498,
    metadata: { product: 'BX-099', application: 'MAA — centralised procedure', sequence: '0000' },
    findings: [
      {
        validator: 'ema_validator', severity: 'warning',
        ruleId: 'EU-M1-CR-005', ruleTitle: 'Bookmark depth recommendation',
        message: 'Cover letter PDF bookmark depth exceeds the EU Module 1 creation rules recommendation (4 levels found, 3 recommended).',
        filePath: 'm1/eu/10-cover/cover-letter.pdf',
        createdHoursAgo: 506, resolved: false,
      },
    ],
  },
  {
    key: 'bx099-fda-ir-response-0042',
    program: null,
    region: 'fda', gateway: 'esg', format: 'ectd', submissionType: 'response', transport: 'as2',
    bundlePath: '/vault/gateway-bundles/bx099/BX099-ind-seq-0042-ir-response.zip',
    bundleSha256: 'c684b308b9d70c3ffac63821a09dbe2487929eb917dda3a10df520c18ddcc0d4',
    bundleSizeBytes: 268435456,
    transmissionId: 'MDN-20260707-000091277',
    status: 'ack2_received',
    submittedHoursAgo: 216, ackHoursAgo: 214,
    metadata: { product: 'BX-099', application: 'IND information request response', sequence: '0042' },
    findings: [
      {
        validator: 'fda_evalidator', severity: 'info',
        ruleId: 'FDA-1789', ruleTitle: 'Cross-reference note',
        message: 'Response cross-references study data submitted in sequence 0038; reviewer note generated, no action required.',
        filePath: 'm1/us/1571-form.pdf',
        createdHoursAgo: 216, resolved: true, resolvedHoursAgo: 200,
        resolutionNote: 'Acknowledged; the cross-reference is intentional.',
      },
    ],
  },
  {
    key: 'bx420-jnda-original-0000',
    program: null,
    region: 'pmda', gateway: 'pmda_gateway', format: 'pmda_ectd', submissionType: 'original', transport: 'sftp',
    bundlePath: '/vault/gateway-bundles/bx420/BX420-jnda-seq-0000.zip',
    bundleSha256: '0cb82a449768f5252decfbbbdd6c2747017c5a1c16e157db81d1f817c7e55330',
    bundleSizeBytes: 934281907,
    transmissionId: 'PMDA-RCPT-2026-004417',
    status: 'validation_failed', errorClass: 'validation',
    errorMessage: 'PMDA pre-check reported 2 errors: JP Module 1 application form XML fails schema validation and one Module 3 leaf checksum mismatch. Correct and resubmit the sequence.',
    submittedHoursAgo: 360, ackHoursAgo: 355,
    metadata: { product: 'BX-420', application: 'J-NDA', sequence: '0000' },
    findings: [
      {
        validator: 'pmda_precheck', severity: 'error',
        ruleId: 'JP-M1-021', ruleTitle: 'JP Module 1 XML schema validation',
        message: 'Application form XML (form 22-1) fails schema validation: element kikan-code is missing a required attribute.',
        filePath: 'm1/jp/jp-index.xml',
        createdHoursAgo: 356, resolved: false,
      },
      {
        validator: 'pmda_precheck', severity: 'error',
        ruleId: 'JP-VAL-108', ruleTitle: 'Leaf checksum mismatch',
        message: 'Computed checksum for one Module 3 leaf does not match the value recorded in the eCTD backbone.',
        filePath: 'm3/32-body-of-data/32s-drug-substance/spec-32s41.pdf',
        createdHoursAgo: 356, resolved: false,
      },
      {
        validator: 'pmda_precheck', severity: 'warning',
        ruleId: 'JP-VAL-055', ruleTitle: 'Japanese-language annotation missing',
        message: 'Japanese-language annotation is missing from one Module 2 quality summary; recommended for reviewer navigation.',
        filePath: 'm2/23-qos/qos-ja.pdf',
        createdHoursAgo: 356, resolved: false,
      },
    ],
  },
  {
    key: 'bx099-hc-annual-0017',
    program: null,
    region: 'ca', gateway: 'hc_cesg', format: 'ectd', submissionType: 'annual_report', transport: 'as2',
    bundlePath: '/vault/gateway-bundles/bx099/BX099-nds-seq-0017-annual.zip',
    bundleSha256: 'fb6a6ae5133e7167e605b3b13a2d45e4ad9799214bff9706e99c956125546a1c',
    bundleSizeBytes: 96468992,
    transmissionId: 'HC-CESG-2026-011923',
    status: 'ack1_received',
    submittedHoursAgo: 120, ackHoursAgo: 119,
    metadata: { product: 'BX-099', application: 'NDS annual notification', sequence: '0017' },
    findings: [],
  },
];

/* ── UDI fixture — BX-204 CGM device variants (GS1 GTIN-14 DIs with valid
   check digits, demo company prefix). Read surface orders by updated_at DESC. */
const UDI_RECORDS = [
  {
    udiDi: '00860004120407',
    deviceName: 'BX-204 CGM Sensor (10-day wear)',
    piFormat: 'AIDC+HRI — (17) expiry, (10) lot',
    gmdnCode: '61748', deviceClass: 'II', productCode: 'QBJ',
    catalogNumber: 'BX204-SNS-10', versionOrModel: 'SNS-10 rev C',
    packageQty: 1, packageType: 'unit carton',
    mriSafety: 'mri_unsafe', lotSerial: 'lot',
    prescriptionUse: true, kit: false, singleUse: true, rxOnly: true,
    gudidStatus: 'published', gudidSubmittedDaysAgo: 58,
    createdDaysAgo: 62, updatedDaysAgo: 2,
  },
  {
    udiDi: '00860004120414',
    deviceName: 'BX-204 CGM Sensor (10-day wear) — 4-pack',
    piFormat: 'AIDC+HRI — (17) expiry, (10) lot',
    gmdnCode: '61748', deviceClass: 'II', productCode: 'QBJ',
    catalogNumber: 'BX204-SNS-10-4PK', versionOrModel: 'SNS-10 rev C',
    packageQty: 4, packageType: 'multi-unit carton',
    mriSafety: 'mri_unsafe', lotSerial: 'lot',
    prescriptionUse: true, kit: false, singleUse: true, rxOnly: true,
    gudidStatus: 'published', gudidSubmittedDaysAgo: 58,
    createdDaysAgo: 62, updatedDaysAgo: 9,
  },
  {
    udiDi: '00860004120421',
    deviceName: 'BX-204 CGM Transmitter',
    piFormat: 'AIDC+HRI — (21) serial',
    gmdnCode: '61748', deviceClass: 'II', productCode: 'QBJ',
    catalogNumber: 'BX204-TX-2', versionOrModel: 'TX-2 rev B',
    packageQty: 1, packageType: 'unit carton',
    mriSafety: 'mri_unsafe', lotSerial: 'serial',
    prescriptionUse: true, kit: false, singleUse: false, rxOnly: true,
    gudidStatus: 'published', gudidSubmittedDaysAgo: 58,
    createdDaysAgo: 62, updatedDaysAgo: 6,
  },
  {
    udiDi: '00860004120438',
    deviceName: 'BX-204 Display Receiver',
    piFormat: 'AIDC+HRI — (21) serial',
    gmdnCode: '61748', deviceClass: 'II', productCode: 'QBJ',
    catalogNumber: 'BX204-RCV-1', versionOrModel: 'RCV-1 rev A',
    packageQty: 1, packageType: 'unit carton',
    mriSafety: 'not_evaluated', lotSerial: 'serial',
    prescriptionUse: true, kit: false, singleUse: false, rxOnly: true,
    gudidStatus: 'submitted', gudidSubmittedDaysAgo: 12,
    createdDaysAgo: 40, updatedDaysAgo: 1,
  },
  {
    udiDi: '00860004120445',
    deviceName: 'BX-204 Sensor Applicator (sterile)',
    piFormat: 'AIDC+HRI — (17) expiry, (10) lot',
    gmdnCode: '61748', deviceClass: 'II', productCode: 'QBJ',
    catalogNumber: 'BX204-APL-1', versionOrModel: 'APL-1 rev C',
    packageQty: 1, packageType: 'sterile pouch',
    mriSafety: 'not_evaluated', lotSerial: 'lot',
    prescriptionUse: true, kit: false, singleUse: true, rxOnly: true,
    gudidStatus: 'submitted', gudidSubmittedDaysAgo: 12,
    createdDaysAgo: 40, updatedDaysAgo: 12,
  },
  {
    udiDi: '00860004120452',
    deviceName: 'BX-204 CGM Starter Kit',
    piFormat: 'AIDC+HRI — (10) lot',
    gmdnCode: '61748', deviceClass: 'II', productCode: 'QBJ',
    catalogNumber: 'BX204-KIT-START', versionOrModel: 'KIT-1 rev A',
    packageQty: 1, packageType: 'kit carton',
    mriSafety: 'mri_unsafe', lotSerial: 'lot',
    prescriptionUse: true, kit: true, singleUse: false, rxOnly: true,
    gudidStatus: 'draft', gudidSubmittedDaysAgo: null,
    createdDaysAgo: 15, updatedDaysAgo: 0,
    note: 'Kit contents: 1 transmitter, 2 sensors, 1 applicator, 1 display receiver.',
  },
  {
    udiDi: '00860004120469',
    deviceName: 'BX-204 CGM Pro Kit (clinic-blinded)',
    piFormat: 'AIDC+HRI — (10) lot',
    gmdnCode: '61748', deviceClass: 'II', productCode: 'QBJ',
    catalogNumber: 'BX204-KIT-PRO', versionOrModel: 'KIT-2 rev A',
    packageQty: 1, packageType: 'kit carton',
    mriSafety: 'mri_unsafe', lotSerial: 'lot',
    prescriptionUse: true, kit: true, singleUse: false, rxOnly: true,
    gudidStatus: 'draft', gudidSubmittedDaysAgo: null,
    createdDaysAgo: 15, updatedDaysAgo: 20,
    note: 'Professional-use configuration; display blinded for masked clinic studies.',
  },
  {
    udiDi: '00860004120476',
    deviceName: 'BX-204 Adhesive Overpatch',
    piFormat: 'HRI — (10) lot',
    gmdnCode: '35529', deviceClass: 'I', productCode: null,
    catalogNumber: 'BX204-OVP-1', versionOrModel: 'OVP-1 rev B',
    packageQty: 10, packageType: 'dispenser box',
    mriSafety: 'mri_safe', lotSerial: 'lot',
    prescriptionUse: false, kit: false, singleUse: true, rxOnly: false,
    gudidStatus: 'rejected', gudidSubmittedDaysAgo: 30,
    createdDaysAgo: 35, updatedDaysAgo: 4,
    note: 'GUDID submission rejected — GMDN term inconsistent with device description; correction in progress.',
  },
];

async function seedTransmittals(client, org, admin, programId) {
  if (!(await tableExists(client, 'submission_transmittals'))) {
    console.log('   ⚠ submission_transmittals not found — skipping');
    return;
  }
  let findingsAvailable = true;
  if (!(await tableExists(client, 'submission_validation_findings'))) {
    console.log('   ⚠ submission_validation_findings not found — seeding transmittals only');
    findingsAvailable = false;
  }

  const submitterId = await resolveSubmitterId(client, admin);

  const idsByKey = new Map();
  let transInserted = 0;
  let transExisting = 0;
  let findingsInserted = 0;

  for (const t of TRANSMITTALS) {
    const found = await client.query(
      `SELECT id FROM submission_transmittals
        WHERE organization_id = $1 AND metadata->>'seed_key' = $2
        LIMIT 1`,
      [org.id, t.key],
    );
    let transId = found.rows[0]?.id;
    if (transId) {
      transExisting += 1;
    } else {
      const parentId = t.parentKey ? idsByKey.get(t.parentKey) ?? null : null;
      const ins = await client.query(
        `INSERT INTO submission_transmittals (
           organization_id, program_id, package_id, parent_transmittal_id,
           region, gateway, format, submission_type, transport,
           bundle_path, bundle_sha256, bundle_size_bytes, transmission_id,
           status, http_status, error_class, error_message,
           submitted_by, submitted_at, ack_received_at, completed_at,
           metadata, created_at, updated_at
         ) VALUES (
           $1, $2, NULL, $3,
           $4, $5, $6, $7, $8,
           $9, $10, $11, $12,
           $13, $14, $15, $16,
           $17,
           NOW() - ($18::numeric * ${H}),
           CASE WHEN $19::numeric IS NULL THEN NULL ELSE NOW() - ($19::numeric * ${H}) END,
           CASE WHEN $20::numeric IS NULL THEN NULL ELSE NOW() - ($20::numeric * ${H}) END,
           $21::jsonb,
           NOW() - ($18::numeric * ${H}),
           NOW() - (COALESCE($20::numeric, $19::numeric, $18::numeric) * ${H})
         )
         RETURNING id`,
        [
          org.id,
          t.program === 'BX-204' ? programId : null,
          parentId,
          t.region, t.gateway, t.format, t.submissionType, t.transport,
          t.bundlePath, t.bundleSha256, t.bundleSizeBytes, t.transmissionId,
          t.status, t.httpStatus ?? null, t.errorClass ?? null, t.errorMessage ?? null,
          submitterId,
          t.submittedHoursAgo, t.ackHoursAgo ?? null, t.completedHoursAgo ?? null,
          JSON.stringify({ ...t.metadata, seed_key: t.key }),
        ],
      );
      transId = ins.rows[0].id;
      transInserted += 1;
    }
    idsByKey.set(t.key, transId);

    if (!findingsAvailable) continue;
    for (const f of t.findings) {
      const existing = await client.query(
        `SELECT id FROM submission_validation_findings
          WHERE transmittal_id = $1 AND message = $2
          LIMIT 1`,
        [transId, f.message],
      );
      if (existing.rows[0]) continue;
      await client.query(
        `INSERT INTO submission_validation_findings (
           transmittal_id, organization_id, validator, severity, rule_id, rule_title,
           message, file_path, resolved, resolved_at, resolved_by, resolution_note,
           created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9,
           CASE WHEN $10::numeric IS NULL THEN NULL ELSE NOW() - ($10::numeric * ${H}) END,
           $11, $12,
           NOW() - ($13::numeric * ${H})
         )`,
        [
          transId, org.id, f.validator, f.severity, f.ruleId ?? null, f.ruleTitle ?? null,
          f.message, f.filePath ?? null, f.resolved === true,
          f.resolved ? f.resolvedHoursAgo ?? null : null,
          f.resolved ? admin.id : null,
          f.resolved ? f.resolutionNote ?? null : null,
          f.createdHoursAgo ?? t.submittedHoursAgo,
        ],
      );
      findingsInserted += 1;
    }
  }

  const skippedNote = transExisting > 0 ? ` (${transExisting} already present)` : '';
  console.log(
    `   ✓ submission: ${transInserted} transmittals + ${findingsInserted} validation findings seeded${skippedNote}`,
  );
}

async function seedUdiRecords(client, org, programId) {
  if (!(await tableExists(client, 'udi_records'))) {
    console.log('   ⚠ udi_records not found — skipping');
    return;
  }

  let inserted = 0;
  let existing = 0;

  for (const u of UDI_RECORDS) {
    const found = await client.query(
      `SELECT id FROM udi_records
        WHERE organization_id = $1 AND udi_di = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [org.id, u.udiDi],
    );
    if (found.rows[0]) {
      existing += 1;
      continue;
    }
    const gudidPayload =
      u.gudidStatus === 'draft'
        ? null
        : JSON.stringify({
            deviceIdentifier: u.udiDi,
            brandName: 'BX-204',
            versionOrModel: u.versionOrModel,
            catalogNumber: u.catalogNumber,
            issuingAgency: 'GS1',
          });
    await client.query(
      `INSERT INTO udi_records (
         organization_id, program_id, device_name, udi_di, issuing_agency,
         udi_pi_format, gmdn_code, device_class, product_code, brand_name,
         catalog_number, version_or_model, package_qty, package_type,
         mri_safety, lot_serial, prescription_use, hctp, kit, single_use, rx_only,
         gudid_status, gudid_submitted_at, gudid_payload, metadata,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, 'GS1',
         $5, $6, $7, $8, 'BX-204',
         $9, $10, $11, $12,
         $13, $14, $15, false, $16, $17, $18,
         $19,
         CASE WHEN $20::numeric IS NULL THEN NULL ELSE NOW() - ($20::numeric * interval '1 day') END,
         $21::jsonb, $22::jsonb,
         NOW() - ($23::numeric * interval '1 day'), NOW() - ($24::numeric * interval '1 day')
       )`,
      [
        org.id, programId, u.deviceName, u.udiDi,
        u.piFormat, u.gmdnCode, u.deviceClass, u.productCode,
        u.catalogNumber, u.versionOrModel, u.packageQty, u.packageType,
        u.mriSafety, u.lotSerial, u.prescriptionUse, u.kit, u.singleUse, u.rxOnly,
        u.gudidStatus, u.gudidSubmittedDaysAgo ?? null,
        gudidPayload,
        JSON.stringify(u.note ? { note: u.note } : {}),
        u.createdDaysAgo, u.updatedDaysAgo,
      ],
    );
    inserted += 1;
  }

  const skippedNote = existing > 0 ? ` (${existing} already present)` : '';
  console.log(`   ✓ udi: ${inserted} device records seeded for BX-204 variants${skippedNote}`);
}

export default async function seed(client, { org, admin }) {
  const programId = await resolveBx204ProgramId(client, org, admin);
  await seedTransmittals(client, org, admin, programId);
  await seedUdiRecords(client, org, programId);
}
