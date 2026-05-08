/**
 * Immunology therapeutic-area profile (Feature 2.7).
 *
 * Covers:
 *   - Mechanism of action / biomarker stratification
 *   - Immunogenicity (ADA / NAb) for biologics
 *   - Infection risk + screening (TB, hepatitis, latent viral)
 *   - Combination-with-bDMARD considerations
 *   - Long-term safety (malignancy, MACE, severe infections)
 *
 * @module server/services/ana/therapeutic-area-profiles/immunology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const immunologyProfile: TherapeuticAreaProfile = {
  id: 'immunology',
  displayName: 'Immunology',
  description:
    'Adapts AnA for immunology / autoimmune submissions: ' +
    'mechanism-of-action grounding, immunogenicity scrutiny, ' +
    'opportunistic-infection risk, and long-term-safety expectations.',

  contextRules: [
    {
      id: 'imm-immunogenicity',
      scope: 'module',
      appliesTo: '5',
      triggerKeywords: ['immunogenicity', 'ADA', 'anti-drug antibody', 'neutralizing'],
      instruction:
        'Biologics require an immunogenicity assessment plan: ADA/NAb assay validation, sampling schedule, impact on PK/PD/efficacy/safety. Immunogenicity-related loss of response should be analyzed as a safety AND efficacy outcome. Reference FDA Immunogenicity Assessment guidance.',
      severity: 'critical',
      guidanceRef: 'FDA Guidance: Immunogenicity Assessment for Therapeutic Protein Products (2014, updated)',
    },
    {
      id: 'imm-infection-screening',
      scope: 'module',
      appliesTo: '5',
      triggerKeywords: ['tuberculosis', 'TB', 'hepatitis', 'screening', 'opportunistic'],
      instruction:
        'Immunosuppressive / immunomodulatory drugs require pre-treatment screening: TB (IGRA or PPD), HBV (HBsAg + anti-HBc), HCV, HIV. Long-term follow-up must capture opportunistic infections (PCP, fungal, JC virus → PML for some agents). Document screening + monitoring algorithm.',
      severity: 'critical',
      guidanceRef: 'CDC + FDA biologic-class labeling precedent (e.g. anti-TNF, JAK inhibitor labels)',
    },
    {
      id: 'imm-malignancy-mace-long-term',
      scope: 'module',
      appliesTo: '5',
      triggerKeywords: ['malignancy', 'MACE', 'cardiovascular', 'long-term'],
      instruction:
        'Immunology trials require long-term-extension (LTE) follow-up to capture: malignancy (lymphoma, NMSC, solid tumor), MACE (per ICH E14), serious infections, herpes zoster reactivation. Power calculations should consider these low-incidence high-impact events.',
      severity: 'major',
      guidanceRef: 'FDA Class Labeling Precedent (JAK inhibitors, anti-TNF, IL-17/23 inhibitors)',
    },
    {
      id: 'imm-moa-grounding',
      scope: 'section',
      appliesTo: '2.4',
      triggerKeywords: ['mechanism', 'MOA', 'cytokine', 'pathway'],
      instruction:
        'Module 2.4 nonclinical overview must clearly tie the molecular MOA to the indication\'s pathophysiology with peer-reviewed literature support. Reviewer expects a logical chain: target → pathway → disease mechanism → therapeutic rationale.',
      severity: 'major',
    },
    {
      id: 'imm-combination-bdmard',
      scope: 'always',
      triggerKeywords: ['combination', 'methotrexate', 'bDMARD', 'add-on'],
      instruction:
        'When combined with conventional or biologic DMARDs, document additive immunosuppression risk. Drug-drug interaction sections should address overlapping immunosuppression, infection risk, and any pharmacokinetic interactions.',
      severity: 'major',
    },
    {
      id: 'imm-vaccination-strategy',
      scope: 'always',
      instruction:
        'Document recommended pre-treatment vaccinations (e.g. live vaccines BEFORE immunosuppression initiation) and post-treatment vaccine response considerations. Required in patient-care plan + label.',
      severity: 'minor',
    },
  ],

  riskFactors: [
    'Immunogenicity may compromise efficacy + cause hypersensitivity → must be assessed throughout',
    'Long-term immunosuppression elevates malignancy + serious-infection risk',
    'Biologic class effects: TNF inhibitors → TB reactivation, JAK inhibitors → MACE/VTE/malignancy',
    'Heterogeneous patient populations (genetics, prior bDMARD exposure) limit generalizability',
    'Auto-immune flare on discontinuation → tapering / withdrawal protocol matters',
    'Live vaccine contraindicated during treatment → vaccination strategy required',
    'Anti-drug antibody (ADA) cross-reactivity with biosimilars is a regulatory + clinical concern',
    'Pregnancy considerations vary by mechanism (some biologics class B/C with placental transfer)',
  ],

  commonGaps: [
    {
      ctdSection: '5.3.4',
      prefix: true,
      patterns: ['immunogenicity', 'ADA', 'anti-drug'],
      description: 'Immunogenicity assessment plan + ADA/NAb assay validation missing',
      severity: 'critical',
      guidanceRef: 'FDA Immunogenicity Assessment Guidance',
    },
    {
      ctdSection: '5.3.5.4',
      prefix: true,
      patterns: ['long-term', 'extension', 'malignancy', 'serious infection'],
      description:
        'Long-term extension data missing for low-incidence high-impact events (malignancy, MACE)',
      severity: 'major',
    },
    {
      ctdSection: '12',
      prefix: true,
      patterns: ['tuberculosis', 'TB', 'hepatitis', 'opportunistic infection'],
      description:
        'Safety analysis missing systematic infection screening + monitoring framework',
      severity: 'critical',
    },
    {
      ctdSection: '2.4',
      patterns: ['mechanism', 'pathway', 'pathophysiology'],
      description:
        'Nonclinical overview lacks clear MOA-to-disease mechanism linkage with literature support',
      severity: 'major',
    },
    {
      ctdSection: '4.2.3',
      prefix: true,
      patterns: ['repeat dose', 'chronic', 'immunotoxicity'],
      description: 'Immunotoxicity assessment missing in repeat-dose toxicology',
      severity: 'major',
      guidanceRef: 'ICH S8',
    },
  ],

  guidanceRefs: [
    {
      code: 'FDA Immunogenicity Assessment',
      authority: 'FDA',
      title: 'Immunogenicity Assessment for Therapeutic Protein Products',
      why: 'Mandatory framework for ADA/NAb assessment; assay validation and interpretation',
    },
    {
      code: 'ICH S6(R1)',
      authority: 'ICH',
      title: 'Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals',
      why: 'Required nonclinical framework for biologics — covers immunogenicity, species selection, repeat dose',
    },
    {
      code: 'ICH S8',
      authority: 'ICH',
      title: 'Immunotoxicity Studies for Human Pharmaceuticals',
      why: 'Defines immunotoxicity testing strategy + when additional studies are needed',
    },
    {
      code: 'FDA Biosimilarity',
      authority: 'FDA',
      title: 'Scientific Considerations in Demonstrating Biosimilarity (2015)',
      why: 'For biosimilar applications; immunogenicity comparability is central',
    },
    {
      code: 'EMA Biosimilars Overarching Guidance',
      authority: 'EMA',
      title: 'CHMP/437/04 — Similar Biological Medicinal Products',
      why: 'EU framework for biosimilars',
    },
  ],

  reviewerExpectations: [
    'Validated immunogenicity assays (screening, confirmatory, NAb)',
    'Pre-treatment infection screening protocol (TB, HBV, HCV, HIV)',
    'Long-term safety follow-up addressing malignancy, MACE, opportunistic infection',
    'Immunotoxicity addressed in repeat-dose nonclinical (ICH S8 framework)',
    'Vaccination strategy documented (live vaccines before treatment; non-live during)',
    'Class-effect comparisons referenced (TNF / JAK / IL-23 / etc.)',
    'Subgroup analyses by prior bDMARD exposure when relevant',
    'Pregnancy + lactation handling per FDA pregnancy + lactation labeling rule',
  ],

  pathwayHints: [
    {
      pathway: 'breakthrough_therapy',
      applicability:
        'Substantial improvement over existing therapy on a clinically significant endpoint',
      impactedSections: ['1.7', '2.5'],
      reviewerNotes:
        'Less common in immunology than oncology; reserved for severe phenotypes (e.g. severe psoriasis or refractory rheumatoid arthritis with novel MOA).',
    },
    {
      pathway: 'fast_track',
      applicability: 'Serious autoimmune condition + unmet medical need',
      impactedSections: ['1.7'],
      reviewerNotes: 'Common for orphan-autoimmune indications (e.g. NMOSD, MG).',
    },
    {
      pathway: 'orphan_drug',
      applicability: 'Rare autoimmune indication < 200K US / < 5 in 10K EU',
      impactedSections: ['1.7', '2.5'],
      reviewerNotes:
        'Many auto-immune subindications qualify (e.g. specific JIA subtypes, certain vasculitides).',
    },
  ],

  statisticalConsiderations: [
    'ACR20/50/70 (RA), PASI 75/90 (psoriasis), DAS28 — composite endpoints with binary thresholds',
    'Non-responder imputation (NRI) for missing data in chronic-disease trials',
    'Hierarchical / sequential testing for multiple secondary endpoints',
    'Long-term extension analysis with appropriate handling of treatment switching',
    'Time-to-flare survival analysis with pre-specified flare criteria',
    'Sensitivity analyses for treatment-policy and hypothetical estimands per ICH E9(R1)',
  ],

  endpointConsiderations: [
    'Disease-activity composite (ACR / DAS28 / PASI / SLEDAI) — pre-specify thresholds',
    'Patient-global assessment + PRO (HAQ-DI, DLQI, PGIS)',
    'Steroid-sparing endpoint (steroid dose at week N)',
    'Radiographic progression (RA, PsA) — central read with validated scoring',
    'Sustained remission rate (clinically meaningful at 12-24 months)',
    'Biomarker pharmacodynamics (cytokines, surface markers, target engagement)',
  ],

  retrievalKeywords: [
    'immunology',
    'autoimmune',
    'rheumatoid arthritis',
    'psoriasis',
    'lupus',
    'inflammatory bowel disease',
    'multiple sclerosis',
    'biologic',
    'biosimilar',
    'immunogenicity',
    'ADA',
    'anti-drug antibody',
    'neutralizing antibody',
    'tuberculosis screening',
    'hepatitis screening',
    'JAK inhibitor',
    'TNF inhibitor',
    'IL-23',
    'IL-17',
    'opportunistic infection',
    'MACE',
    'malignancy',
    'ICH S6',
    'ICH S8',
    'ACR20',
    'DAS28',
    'PASI',
  ],
};
