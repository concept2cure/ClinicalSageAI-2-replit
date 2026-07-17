/**
 * Wave-3 domain seed — IND lifecycle checklist (BX-301 initial IND).
 *
 * One IND-checklist row for the demo org, mirroring the v2 IndLifecycle fixture
 * (INDL_PROGRAM + INDL_FORMS + INDL_SECTIONS): the BX-301 anti-BCMA mAb IND with
 * its three Module 1 forms (1571 / 1572 / 3674) and its 17-section eCTD
 * blueprint, each item carrying its per-instance completion state. Read by
 * GET /api/ind-checklist; the surface renders the forms checklist and computes
 * filing readiness from the section statuses. The two nested checklist arrays
 * are stored as JSONB. to_regclass guarded, org-scoped, idempotent
 * (ON CONFLICT DO NOTHING).
 */
const PROGRAM = {
  code: 'BX-301',
  drugName: 'BX-301',
  productName: 'BX-301 (anti-BCMA mAb)',
  indication: 'Relapsed/refractory multiple myeloma',
  sponsorName: 'Concept2Cure',
  submissionType: 'IND',
  targetReceiptOffsetDays: 14,
};

const FORMS = [
  { id: 'FDA_1571', title: 'Form FDA 1571', label: 'IND Application', ref: '21 CFR 312.23(a)(1)', done: true },
  { id: 'FDA_1572', title: 'Form FDA 1572', label: 'Statement of Investigator', ref: '21 CFR 312.53(c)', done: true },
  { id: 'FDA_3674', title: 'Form FDA 3674', label: 'Certification of Compliance (ClinicalTrials.gov)', ref: '42 USC 282(j)(5)(B)', done: false },
];

const SECTIONS = [
  { code: 'm1.2', title: 'Cover Letter', module: 'M1', ref: '21 CFR 312.23(a)(1)', ai: true, status: 'signed' },
  { code: 'm1.3.3', title: 'Debarment Certification', module: 'M1', ref: '21 USC 335a', ai: false, status: 'approved' },
  { code: 'm1.5', title: 'Table of Contents', module: 'M1', ref: '21 CFR 312.23(a)(1)', ai: true, status: 'approved' },
  { code: 'm1.6.1', title: 'Introductory Statement', module: 'M1', ref: '21 CFR 312.23(a)(3)(i)', ai: true, status: 'approved' },
  { code: 'm1.6.2', title: 'General Investigational Plan', module: 'M1', ref: '21 CFR 312.23(a)(3)(iv)', ai: true, status: 'qa_review' },
  { code: 'm1.7', title: "Investigator's Brochure", module: 'M1', ref: '21 CFR 312.23(a)(5)', ai: true, status: 'drafting' },
  { code: 'm1.9', title: 'Environmental Assessment / Categorical Exclusion', module: 'M1', ref: '21 CFR 25.31', ai: true, status: 'approved' },
  { code: 'm2.3', title: 'Quality Overall Summary', module: 'M2', ref: 'ICH M4Q(R1)', ai: true, status: 'approved' },
  { code: 'm2.4', title: 'Nonclinical Overview', module: 'M2', ref: 'ICH M4S(R2)', ai: true, status: 'internal_review' },
  { code: 'm2.6', title: 'Nonclinical Written & Tabulated Summaries', module: 'M2', ref: 'ICH M4S(R2)', ai: true, status: 'approved' },
  { code: 'm3.2.S.2', title: 'Manufacture (Drug Substance)', module: 'M3', ref: 'ICH Q7', ai: true, status: 'approved' },
  { code: 'm3.2.S.4', title: 'Control of Drug Substance', module: 'M3', ref: 'ICH Q6A', ai: true, status: 'approved' },
  { code: 'm3.2.S.7', title: 'Stability (Drug Substance)', module: 'M3', ref: 'ICH Q1A/Q1B', ai: true, status: 'drafting' },
  { code: 'm3.2.P.3', title: 'Manufacture (Drug Product)', module: 'M3', ref: 'ICH Q7', ai: true, status: 'approved' },
  { code: 'm3.2.P.8', title: 'Stability (Drug Product)', module: 'M3', ref: 'ICH Q1A/Q5C', ai: true, status: 'drafting' },
  { code: 'm4.2.1', title: 'Pharmacology', module: 'M4', ref: 'ICH S7A/S7B', ai: false, status: 'approved' },
  { code: 'm4.2.2', title: 'Pharmacokinetics', module: 'M4', ref: 'ICH M4S', ai: false, status: 'approved' },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_ind_checklist') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_ind_checklist not found — run migrations first, skipping');
    return;
  }
  const r = await client.query(
    `INSERT INTO c2c_ind_checklist (
       id, organization_id, seq, drug_name, product_name, indication,
       sponsor_name, submission_type, target_receipt_offset_days, forms, sections
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
     ON CONFLICT (organization_id, id) DO NOTHING`,
    [
      PROGRAM.code, org.id, 1, PROGRAM.drugName, PROGRAM.productName, PROGRAM.indication,
      PROGRAM.sponsorName, PROGRAM.submissionType, PROGRAM.targetReceiptOffsetDays,
      JSON.stringify(FORMS), JSON.stringify(SECTIONS),
    ],
  );
  console.log(`   ✓ ind checklist: ${r.rowCount ?? 0} IND checklist row seeded`);
}
