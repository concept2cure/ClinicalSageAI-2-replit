/**
 * Seed Default Canon
 *
 * Auto-populates baseline regulatory canon items and skill bundles
 * when an organization is created. These are structural pointers and
 * constraints — not encyclopedias. AnA already has deep regulatory
 * training; these seeds tell her what to focus on, what structure
 * to follow, and what to avoid for each project type + document type.
 *
 * Scoped by submission type and regulatory region so only relevant
 * knowledge loads for each project.
 */

import { assertCanonFact } from './account-canon.js';
import { createSkillBundle } from './account-skill-bundles.js';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('seed-default-canon');

// ═══════════════════════════════════════════════════════════════════════
// Agency regulatory profiles
// ═══════════════════════════════════════════════════════════════════════

const AGENCY_PROFILES = [
  {
    region: 'US-FDA',
    key: 'fda-submission-profile',
    title: 'FDA Submission Profile',
    content: 'Gateway: ESG (Electronic Submissions Gateway). Format: eCTD with US regional Module 1. Sequence numbering 0000–9999. Validation: FDA validator tool required before submission. Review types: Standard (10-month PDUFA), Priority (6-month), Accelerated, Fast Track, Breakthrough. Pre-submission meetings: Type A (30 days), Type B (60 days), Type C (75 days). Post-market: MedWatch/FAERS for drugs, MDR for devices. Electronic records per 21 CFR Part 11.',
  },
  {
    region: 'EU-EMA',
    key: 'ema-submission-profile',
    title: 'EMA Submission Profile',
    content: 'Procedure: Centralized (mandatory for biologics, orphan, oncology), Decentralized (DCP), Mutual Recognition (MRP). Format: eCTD with EU Module 1. Timeline: Day 80 assessment, Day 120 joint, Day 180 opinion. Rapporteur/co-rapporteur assigned. SmPC and PIL required in QRD template. Risk Management Plan mandatory. Pharmacovigilance System Master File required. Pediatric Investigation Plan compliance check at MAA.',
  },
  {
    region: 'JP-PMDA',
    key: 'pmda-submission-profile',
    title: 'PMDA Submission Profile',
    content: 'Format: J-CTD (Japanese CTD) with Japan-specific Module 1 in Japanese. Bridging studies may be required per ICH E5 for ethnic factors. PMDA pre-application consultation available. Regulatory review 12 months standard. Pricing via NHI drug price listing. GMP inspection by PMDA during review. Post-market: re-examination period (4-10 years), adverse reaction reports.',
  },
  {
    region: 'CA-HC',
    key: 'hc-submission-profile',
    title: 'Health Canada Submission Profile',
    content: 'Submission types: NDS (New Drug Submission), ANDS (Abbreviated), SNDS (Supplemental). Format: eCTD with Canadian Module 1. Review: 300 days standard, 180 days priority. NOC (Notice of Compliance) for approval. NOC/c (with conditions) for accelerated. Bilingual labeling required (English/French). CTA (Clinical Trial Application) for clinical trials — 30-day no-objection letter.',
  },
  {
    region: 'UK-MHRA',
    key: 'mhra-submission-profile',
    title: 'MHRA Submission Profile',
    content: 'Post-Brexit pathways: national route, ILAP (Innovative Licensing and Access Pathway), international reliance (Project Orbis, Access Consortium). Format: eCTD. Rolling review available. MHRA may rely on FDA/EMA assessments. UK-specific SmPC format. Great British device regulations replacing EU MDR/IVDR.',
  },
  {
    region: 'AU-TGA',
    key: 'tga-submission-profile',
    title: 'TGA Submission Profile',
    content: 'Evaluation categories: Category 1 (new active, ~250 working days), Category 2 (extensions, ~175 days), Category 3 (generic, ~100 days). Format: eCTD. PI (Product Information) and CMI (Consumer Medicine Information) required. PBS listing for reimbursement. Access Consortium member — mutual recognition with Canada, Singapore, Switzerland, UK.',
  },
];

// ═══════════════════════════════════════════════════════════════════════
// Submission type document structure maps
// ═══════════════════════════════════════════════════════════════════════

const SUBMISSION_STRUCTURES = [
  {
    types: ['BLA'],
    key: 'bla-document-structure',
    title: 'BLA Document Structure & Requirements',
    content: 'Module 1: Cover letter, FDA forms (1571/1572/3674), labeling. Module 2: 2.3 QOS (biologic CMC), 2.4 Nonclinical overview, 2.5 Clinical overview, 2.7 Clinical summary. Module 3: 3.2.S Drug substance (cell line, process, characterization, control, stability), 3.2.P Drug product (formulation, process, excipients, control, stability), 3.2.A Appendices. Module 4: Nonclinical study reports. Module 5: Clinical study reports, ISS, ISE. Key BLA focus: immunogenicity assessment, potency assays, comparability for process changes, biosimilar pathway if 351(k).',
  },
  {
    types: ['NDA'],
    key: 'nda-document-structure',
    title: 'NDA Document Structure & Requirements',
    content: 'Module 1: Cover letter, FDA forms, labeling (highlights + FPI), REMS if required. Module 2: 2.3 QOS, 2.4 Nonclinical overview, 2.5 Clinical overview, 2.7 Clinical summary (2.7.1 biopharm, 2.7.2 clin pharm, 2.7.3 efficacy, 2.7.4 safety, 2.7.6 synopses). Module 3: 3.2.S/3.2.P standard CMC. Module 4: Nonclinical reports. Module 5: CSRs, ISS, ISE. Key NDA focus: safety database per ICH E1, bioequivalence if applicable, labeling content.',
  },
  {
    types: ['IND'],
    key: 'ind-document-structure',
    title: 'IND Document Structure & Requirements',
    content: 'Initial IND: FDA Form 1571, TOC, introductory statement, general investigational plan, IB, protocol, CMC (phase-appropriate), pharmacology/toxicology, previous human experience. Phase-appropriate CMC: Phase 1 minimal (identity, purity, potency), Phase 2 more complete, Phase 3 full. Annual reporting required. IND safety reports: 7-day (fatal/life-threatening), 15-day (serious unexpected). Protocol amendments and information amendments as needed.',
  },
  {
    types: ['510K'],
    key: '510k-document-structure',
    title: '510(k) Document Structure & Requirements',
    content: 'Required sections: Cover letter, CDRH premarket review submission cover sheet, indications for use statement, 510(k) summary or statement, truthful and accuracy statement, class III summary (if applicable), financial certification/disclosure, declarations of conformity/certificates, executive summary, device description, substantial equivalence comparison, performance testing, biocompatibility (ISO 10993), sterility (if applicable), software (IEC 62304 if applicable), labeling, clinical (if needed).',
  },
  {
    types: ['PMA'],
    key: 'pma-document-structure',
    title: 'PMA Document Structure & Requirements',
    content: 'Required sections: Cover letter, TOC, summary/abstract, device description, indications for use, marketing history, summary of S&E, device design, manufacturing, performance standards, preclinical data, clinical investigations (pivotal study), bibliography, labeling, environmental assessment, panel track information. PMA supplements: 180-day (new indication, significant design change), real-time (manufacturing change), 30-day notice (labeling), annual report (minor changes).',
  },
  {
    types: ['CER'],
    key: 'cer-document-structure',
    title: 'CER Document Structure (EU MDR)',
    content: 'Per MEDDEV 2.7/1 Rev 4: Scope, clinical background, state of the art, device description, intended purpose, clinical claims, clinical data sources (literature, clinical investigations, PMS, PMCF), appraisal of clinical data, analysis of data, benefit-risk assessment, conclusions. Requires: clinical evaluation plan, systematic literature search (PRISMA methodology), equivalence assessment (if using equivalent device data), PMCF plan, PMCF evaluation report.',
  },
  {
    types: ['MAA'],
    key: 'maa-document-structure',
    title: 'MAA Document Structure & Requirements',
    content: 'EU Module 1: Application form, SmPC/PIL/labeling, qualified person declaration, orphan status (if applicable), GMP/GCP certificates, Environmental Risk Assessment, Pediatric data, RMP. Modules 2-5: Standard eCTD. Key EU differences: Risk Management Plan mandatory from submission, PSUR/PBRER required, pediatric compliance check, conditional MA possible for unmet medical need.',
  },
];

// ═══════════════════════════════════════════════════════════════════════
// Document-type authoring skill bundles
// ═══════════════════════════════════════════════════════════════════════

const DOCUMENT_SKILL_BUNDLES = [
  {
    name: 'Clinical Overview (m2.5) Authoring',
    types: ['BLA', 'NDA', 'MAA'],
    regions: ['US-FDA', 'EU-EMA'],
    instructions: 'Structure: product development rationale, biopharmaceutics overview, clinical pharmacology overview, efficacy overview, safety overview, benefit-risk conclusions. Integrate ISS/ISE findings. Present benefit-risk as structured assessment with quantified benefits and characterized risks. Address special populations. Common deficiencies: insufficient benefit-risk analysis, missing subgroup data, inconsistency with Module 5 data.',
  },
  {
    name: 'Nonclinical Overview (m2.4) Authoring',
    types: ['BLA', 'NDA', 'IND', 'MAA'],
    regions: ['US-FDA', 'EU-EMA'],
    instructions: 'Structure: nonclinical testing strategy, pharmacology (primary, secondary, safety), PK (absorption, distribution, metabolism, excretion), toxicology (single-dose, repeat-dose, genotoxicity, carcinogenicity, reproductive). Align with ICH M3 phasing. Discuss nonclinical-clinical correlation. Common deficiencies: missing NOAEL justification for starting dose, incomplete reproductive toxicology.',
  },
  {
    name: 'Quality Overall Summary (m2.3) Authoring',
    types: ['BLA', 'NDA', 'IND', 'MAA'],
    regions: ['US-FDA', 'EU-EMA'],
    instructions: 'Structure: drug substance (general properties, manufacture, characterization, control, reference standards, container closure, stability), drug product (same subsections), appendices (facilities, adventitious agents for biologics, novel excipients). For biologics: include cell line history, viral clearance, comparability data. Common deficiencies: incomplete specification justification, missing validation of analytical methods, insufficient stability data.',
  },
  {
    name: 'CSR Synopsis Authoring',
    types: ['BLA', 'NDA', 'MAA'],
    regions: ['US-FDA', 'EU-EMA'],
    instructions: 'Follow ICH E3 structure: title, investigators, study centers, publication, study dates, objectives, methodology (design, population, treatments, endpoints, statistics), results (disposition, demographics, efficacy, safety), conclusions. Present primary endpoint results with CI and p-value. Summarize AEs in tables (TEAEs, SAEs, deaths, discontinuations). Statistical analysis per SAP.',
  },
  {
    name: 'Drug Substance (m3.2.S) Authoring',
    types: ['BLA', 'NDA', 'IND', 'MAA'],
    regions: ['US-FDA', 'EU-EMA'],
    instructions: 'Sections: 3.2.S.1 General information (nomenclature, structure, properties), 3.2.S.2 Manufacture (manufacturer, process, controls, validation), 3.2.S.3 Characterisation (elucidation, impurities), 3.2.S.4 Control (specification, analytical procedures, validation, batch analyses, justification), 3.2.S.5 Reference standards, 3.2.S.6 Container closure, 3.2.S.7 Stability. For biologics: add cell bank characterization, viral safety, process-related impurities.',
  },
  {
    name: 'Drug Product (m3.2.P) Authoring',
    types: ['BLA', 'NDA', 'IND', 'MAA'],
    regions: ['US-FDA', 'EU-EMA'],
    instructions: 'Sections: 3.2.P.1 Description and composition, 3.2.P.2 Pharmaceutical development (formulation, overages, properties, manufacturing process development, container closure, compatibility), 3.2.P.3 Manufacture (manufacturers, batch formula, process description, controls), 3.2.P.4 Control of excipients, 3.2.P.5 Control of drug product (specification, methods, validation, batch analyses, characterisation of impurities, justification), 3.2.P.7 Container closure, 3.2.P.8 Stability.',
  },
  {
    name: '510(k) Substantial Equivalence Authoring',
    types: ['510K'],
    regions: ['US-FDA'],
    instructions: 'Structure: predicate identification (product code, regulation number, classification), comparison table (intended use, technological characteristics, performance characteristics). Address each difference: explain why it does not raise new questions of safety/effectiveness, provide supporting data where needed. Use side-by-side matrix format. Common deficiencies: inadequate predicate selection justification, missing performance data for new features, incomplete biocompatibility when patient contact changes.',
  },
  {
    name: 'CER Clinical Evaluation Authoring',
    types: ['CER', 'IVDR'],
    regions: ['EU-EMA'],
    instructions: 'Follow MEDDEV 2.7/1 Rev 4. Structure: scope and plan, device description and intended purpose, clinical background and state of the art, clinical data identification (literature search with PRISMA, clinical investigations, PMS/PMCF data), appraisal of each data source, analysis against clinical claims and essential requirements. Equivalence assessment if using equivalent device data — must demonstrate clinical, technical, and biological equivalence. Conclude with benefit-risk assessment and overall conclusions. PMCF plan required.',
  },
  {
    name: 'eCTD Cover Letter Authoring',
    types: ['BLA', 'NDA', 'IND', 'MAA'],
    regions: ['US-FDA', 'EU-EMA'],
    instructions: 'Include: submission type and purpose, product name and application number (if supplement/amendment), list of enclosed modules, regulatory history summary, any special designations (orphan, fast track, breakthrough), contact information for regulatory correspondence. For FDA: reference PDUFA/MDUFA date if applicable. For EMA: reference procedure type and rapporteur. Keep concise — 1-2 pages maximum.',
  },
  {
    name: 'Investigator Brochure Authoring',
    types: ['IND', 'BLA', 'NDA'],
    regions: ['US-FDA', 'EU-EMA'],
    instructions: 'Follow ICH E6(R2) section 7. Structure: confidentiality statement, summary, introduction, physical/chemical/pharmaceutical properties, nonclinical studies (pharmacology, PK, toxicology), effects in humans (PK, safety, efficacy), summary of data and guidance for investigator. Update at least annually. Include all relevant new safety information. Present data objectively — avoid promotional language.',
  },
];

// ═══════════════════════════════════════════════════════════════════════
// eCTD / dossier assembly constraints
// ═══════════════════════════════════════════════════════════════════════

const DOSSIER_CONSTRAINTS = [
  {
    key: 'ectd-format-requirements',
    title: 'eCTD Technical Format Requirements',
    content: 'PDF/A-1b or PDF/A-2b required. Fonts must be embedded. Bookmarks required for documents >5 pages. Hyperlinks for cross-references between modules. No security/password protection. Page size: US Letter (8.5x11) for FDA, A4 for EMA/PMDA. Margins: 1 inch minimum. TOC auto-generated for documents >20 pages. File naming per ICH granularity document.',
  },
  {
    key: 'ectd-lifecycle-management',
    title: 'eCTD Lifecycle Management',
    content: 'Operations: new (initial submission), append (add to existing leaf), replace (supersede existing leaf), delete (remove leaf). Each operation creates a new sequence. Never modify submitted sequences — only add new operations in new sequences. Maintain STF (Study Tagging Files) for Module 5. CDISC data standards: SEND for nonclinical, SDTM/ADaM for clinical.',
  },
  {
    key: 'cross-reference-standards',
    title: 'Cross-Reference Standards',
    content: 'Internal hyperlinks between CTD modules required. Module 2 summaries must reference Module 3/4/5 source documents. CSR synopses in 2.7.6 must link to full CSRs in 5.3. Nonclinical overview must reference individual study reports in 4.2. Use relative hyperlinks (not absolute paths) for portability across viewing systems.',
  },
];

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Seed default canon items and skill bundles for a new organization.
 * Idempotent — checks for existing items before inserting.
 * Called during org onboarding or on-demand via admin route.
 */
export async function seedDefaultCanon(organizationId: number): Promise<{
  canonItems: number;
  skillBundles: number;
  errors: string[];
}> {
  let canonItems = 0;
  let skillBundles = 0;
  const errors: string[] = [];

  // 1. Agency profiles
  for (const agency of AGENCY_PROFILES) {
    try {
      await assertCanonFact({
        organizationId,
        category: 'regulatory_region',
        key: agency.key,
        title: agency.title,
        content: agency.content,
        regulatoryRegions: [agency.region],
        submissionTypes: ['BLA', 'NDA', 'IND', '510K', 'PMA', 'MAA', 'CER', 'IVDR', 'DE_NOVO', 'EUA'],
        sourceType: 'regulatory_guidance',
        sourceDescription: `${agency.region} submission requirements`,
        confidenceScore: 0.95,
      });
      canonItems++;
    } catch (e) {
      errors.push(`Agency ${agency.region}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. Submission type structures
  for (const structure of SUBMISSION_STRUCTURES) {
    try {
      await assertCanonFact({
        organizationId,
        category: 'submission_pattern',
        key: structure.key,
        title: structure.title,
        content: structure.content,
        submissionTypes: structure.types,
        regulatoryRegions: ['US-FDA', 'EU-EMA', 'JP-PMDA', 'CA-HC'],
        sourceType: 'regulatory_guidance',
        sourceDescription: `${structure.types.join('/')} document structure`,
        confidenceScore: 0.95,
      });
      canonItems++;
    } catch (e) {
      errors.push(`Structure ${structure.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3. Document authoring skill bundles
  for (const bundle of DOCUMENT_SKILL_BUNDLES) {
    try {
      await createSkillBundle({
        organizationId,
        name: bundle.name,
        bundleType: 'authoring',
        submissionTypes: bundle.types,
        regulatoryRegions: bundle.regions,
        promptFragments: [
          {
            role: 'system',
            content: bundle.instructions,
            priority: 90,
          },
        ],
        evidencePreferences: {
          preferredTypes: ['clinical_trial', 'real_world', 'literature', 'nonclinical'],
          citationStyle: 'regulatory',
        },
        authorityResponseStyle: {
          tone: 'formal_regulatory',
          requiredElements: ['evidence_citations', 'regulatory_references', 'structured_sections'],
        },
      });
      skillBundles++;
    } catch (e) {
      errors.push(`Bundle ${bundle.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 4. Dossier assembly constraints
  for (const constraint of DOSSIER_CONSTRAINTS) {
    try {
      await assertCanonFact({
        organizationId,
        category: 'compliance_constraint',
        key: constraint.key,
        title: constraint.title,
        content: constraint.content,
        submissionTypes: ['BLA', 'NDA', 'IND', 'MAA'],
        regulatoryRegions: ['US-FDA', 'EU-EMA', 'JP-PMDA', 'CA-HC'],
        sourceType: 'industry_standard',
        sourceDescription: 'eCTD/ICH dossier assembly standards',
        confidenceScore: 0.95,
      });
      canonItems++;
    } catch (e) {
      errors.push(`Dossier ${constraint.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  log.info('Default canon seeded', { organizationId, canonItems, skillBundles, errors: errors.length });
  return { canonItems, skillBundles, errors };
}
