/**
 * Wave-3 domain seed — Investigator's Brochure (ICH E6(R2) §7) readiness evidence.
 *
 * The IB has NO authored instance table: the v2 InvestigatorBrochure surface's
 * per-section readiness is *assembled* from the REAL, org-scoped upstream evidence
 * stores (server/services/authoring/investigator-brochure-view-assembler.ts, read by
 * GET /api/investigator-brochure). The seed-only `c2c_investigator_brochure` blob is
 * RETIRED (2026-08) — this seed writes NO blob.
 *
 * The four IB input domains are backed by the stores where the BX-204 program's real
 * evidence already lives, provisioned by the platform's own domain seeds:
 *   nonclinical (§4/4.1–4.3) ← nonclinical_studies      (seed-ga-demo.mjs: TX-701 …)
 *   clinical    (§5/5.1/5.2) ← clinical_ops.studies     (seed-ga-demo.mjs: BX204-301 …)
 *   safety      (§5.2/5.3)   ← adverse_events           (96-safety-narrative.mjs: ICSR-88xx)
 *   product     (§2/§3)      ← cmc_module3_sections     ← THIS SEED
 *
 * Only the PRODUCT domain (physical/chemical/pharmaceutical properties & formulation,
 * ICH M4 Module 3.2.S / 3.2.P) is otherwise unseeded, so this seed provisions the
 * BX-204 drug-substance and drug-product Module 3 sections into the REAL
 * `cmc_module3_sections` store — the exact table the assembler reads for the product
 * domain and that the CMC Module 3 authoring engine writes. With it, the demo IB's
 * §2 Introduction and §3 Properties/Formulation flip to "Ready" and the four-domain
 * BX-204 IB reads fully green. to_regclass-guarded, org-scoped, idempotent.
 */
const PROJECT_ID = 'bx204';

const M3_SECTIONS = [
  {
    section_key: '3.2.S.1',
    section_path: '3.2.S.1 Drug Substance — General Information',
    deterministic_json: {
      inn: 'braxenozumab',
      code: 'BX-204',
      molecularType: 'humanized IgG1 monoclonal antibody',
      molecularWeight: '~148 kDa',
      structure: 'Heterotetramer (2 heavy + 2 light chains); N-linked glycosylation at the Fc CH2 domain.',
    },
    narrative_text:
      'BX-204 (INN: braxenozumab) is a humanized IgG1 monoclonal antibody, approximate molecular weight 148 kDa, ' +
      'produced in a CHO cell line. The drug substance is a clear to slightly opalescent, colorless to pale-yellow ' +
      'aqueous solution. Primary structure and post-translational modifications (N-linked glycosylation) are ' +
      'confirmed by peptide mapping and released-glycan analysis.',
  },
  {
    section_key: '3.2.P.1',
    section_path: '3.2.P.1 Drug Product — Description and Composition',
    deterministic_json: {
      dosageForm: 'sterile solution for infusion',
      strength: '200 mg / 10 mL (20 mg/mL)',
      container: 'single-use Type I glass vial, fluoropolymer-coated stopper',
      excipients: ['histidine buffer', 'sucrose', 'polysorbate 80'],
      storage: '2–8 °C, protect from light; do not freeze or shake.',
    },
    narrative_text:
      'BX-204 drug product is a preservative-free sterile solution for infusion, 200 mg/10 mL (20 mg/mL), ' +
      'filled in single-use Type I glass vials with a fluoropolymer-coated stopper. The formulation comprises ' +
      'histidine buffer, sucrose (tonicity/stabilizer), and polysorbate 80 (surfactant), pH 6.0. Store at ' +
      '2–8 °C protected from light; do not freeze or shake.',
  },
];

/** Stable, content-derived pseudo-hash (the real engine stores a compiled hash). */
function hashOf(section) {
  const s = `${section.section_key}|${section.narrative_text}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `seed-${(h >>> 0).toString(16)}`;
}

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.cmc_module3_sections') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ cmc_module3_sections not found — run migrations first, skipping IB product seed');
    return;
  }

  const existing = await client.query(
    `SELECT 1 FROM cmc_module3_sections WHERE organization_id = $1 AND section_key IN ('3.2.S.1','3.2.P.1') LIMIT 1`,
    [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ Investigator\'s Brochure product evidence: Module 3 already present, skipping');
    return;
  }

  let inserted = 0;
  for (const s of M3_SECTIONS) {
    const r = await client.query(
      `INSERT INTO cmc_module3_sections
         (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, approval_state)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'approved')
       ON CONFLICT (project_id, section_key) DO NOTHING`,
      [org.id, PROJECT_ID, s.section_key, s.section_path, JSON.stringify(s.deterministic_json), s.narrative_text, hashOf(s)],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(
    `   ✓ Investigator's Brochure: ${inserted} BX-204 Module 3 (product) section(s) seeded into cmc_module3_sections ` +
      '(nonclinical/clinical/safety domains provisioned by their own real stores; no blob)',
  );
}
