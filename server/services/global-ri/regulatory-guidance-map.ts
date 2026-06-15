/**
 * Regulatory guidance map — grounds any regulatory activity/document in its
 * governing ICH guidelines + key regulations.
 *
 * The deterministic grounding layer for the RA/AnA stack: given a regulatory
 * topic (a document type or activity — CSR, stability, GCP, carcinogenicity, …)
 * it returns the relevant ICH guideline references (resolved against the ICH
 * catalog, so titles never drift) plus the key statutory citations. This lets a
 * drafting/advice layer cite authoritative sources rather than assert them.
 *
 * Pure / deterministic — no DB, no IO. The ICH codes are the single source of
 * truth; titles come from `ich-guideline-catalog`.
 *
 * @module server/services/global-ri/regulatory-guidance-map
 */

import { getGuideline } from './ich-guideline-catalog';

interface GuidanceEntry {
  /** ICH guideline codes (resolved to titles via the catalog). */
  ich: string[];
  /** Key statutory / framework citations. */
  regulations: string[];
  description: string;
}

/** Topic → governing ICH guidelines + regulations. Topic keys are stable. */
const GUIDANCE_MAP: Record<string, GuidanceEntry> = {
  // ── Efficacy / clinical ──────────────────────────────────────────────────
  clinical_study_report: { ich: ['E3'], regulations: ['ICH E3'], description: 'Structure and content of a clinical study report.' },
  protocol: { ich: ['E6', 'E8', 'E9', 'M11'], regulations: ['ICH E6(R2) §6'], description: 'Clinical trial protocol design and content.' },
  investigators_brochure: { ich: ['E6'], regulations: ['ICH E6(R2) §7'], description: "Investigator's Brochure content." },
  good_clinical_practice: { ich: ['E6', 'E8'], regulations: ['ICH E6(R2)', '21 CFR 50/56/312'], description: 'Good Clinical Practice and general clinical considerations.' },
  statistical_analysis: { ich: ['E9'], regulations: ['ICH E9 (+E9(R1) estimands)'], description: 'Statistical principles for clinical trials.' },
  dose_response: { ich: ['E4'], regulations: ['ICH E4'], description: 'Dose-response information to support registration.' },
  control_group: { ich: ['E10'], regulations: ['ICH E10'], description: 'Choice of control group in clinical trials.' },
  pediatric_clinical: { ich: ['E11'], regulations: ['21 CFR 314 (PREA) / BPCA', 'EU Reg (EC) 1901/2006 (PIP)'], description: 'Pediatric clinical investigation + pediatric requirements.' },
  qt_assessment: { ich: ['E14', 'S7B'], regulations: ['ICH E14 / S7B'], description: 'QT/QTc prolongation clinical + nonclinical evaluation.' },
  multiregional_trial: { ich: ['E17'], regulations: ['ICH E17'], description: 'General principles for multi-regional clinical trials.' },
  // ── Pharmacovigilance / safety reporting ──────────────────────────────────
  pharmacovigilance_planning: { ich: ['E2E'], regulations: ['ICH E2E', 'EU GVP Module IX'], description: 'Pharmacovigilance planning / signal management.' },
  expedited_safety_reporting: { ich: ['E2A'], regulations: ['21 CFR 312.32'], description: 'Expedited reporting of clinical safety data (IND safety reports).' },
  icsr: { ich: ['E2B', 'M1'], regulations: ['ICH E2B(R3)'], description: 'Individual Case Safety Report data elements + MedDRA coding.' },
  periodic_benefit_risk: { ich: ['E2C'], regulations: ['ICH E2C(R2) PBRER'], description: 'Periodic Benefit-Risk Evaluation Report.' },
  dsur: { ich: ['E2F'], regulations: ['ICH E2F', '21 CFR 312.33'], description: 'Development Safety Update Report / IND annual report.' },
  postapproval_safety: { ich: ['E2D'], regulations: ['ICH E2D'], description: 'Post-approval safety data management.' },
  // ── Quality / CMC ─────────────────────────────────────────────────────────
  stability: { ich: ['Q1'], regulations: ['ICH Q1A–Q1F'], description: 'Stability testing of new drug substances and products.' },
  analytical_validation: { ich: ['Q2', 'Q14'], regulations: ['ICH Q2(R2) / Q14'], description: 'Analytical procedure validation + development.' },
  impurities: { ich: ['Q3A', 'Q3B', 'Q3C', 'Q3D'], regulations: ['ICH Q3A–Q3D'], description: 'Impurities, residual solvents, elemental impurities.' },
  biotech_quality: { ich: ['Q5A', 'Q5B', 'Q5C', 'Q5D', 'Q5E', 'Q6B'], regulations: ['ICH Q5A–E / Q6B'], description: 'Quality of biotechnological products.' },
  specifications: { ich: ['Q6A', 'Q6B'], regulations: ['ICH Q6A / Q6B'], description: 'Specifications for new drug substances and products.' },
  gmp_api: { ich: ['Q7'], regulations: ['ICH Q7', '21 CFR 210/211'], description: 'GMP for active pharmaceutical ingredients.' },
  pharmaceutical_development: { ich: ['Q8'], regulations: ['ICH Q8(R2)'], description: 'Pharmaceutical development (QbD).' },
  quality_risk_management: { ich: ['Q9'], regulations: ['ICH Q9(R1)'], description: 'Quality risk management.' },
  pharmaceutical_quality_system: { ich: ['Q10'], regulations: ['ICH Q10'], description: 'Pharmaceutical quality system.' },
  drug_substance_development: { ich: ['Q11'], regulations: ['ICH Q11'], description: 'Development and manufacture of drug substances.' },
  lifecycle_management: { ich: ['Q12'], regulations: ['ICH Q12'], description: 'Lifecycle management of post-approval CMC changes.' },
  continuous_manufacturing: { ich: ['Q13'], regulations: ['ICH Q13'], description: 'Continuous manufacturing of drug substances and products.' },
  // ── Nonclinical safety ────────────────────────────────────────────────────
  carcinogenicity: { ich: ['S1A', 'S1B', 'S1C'], regulations: ['ICH S1A–S1C'], description: 'Carcinogenicity studies.' },
  genotoxicity: { ich: ['S2'], regulations: ['ICH S2(R1)'], description: 'Genotoxicity testing battery.' },
  toxicokinetics: { ich: ['S3A', 'S3B'], regulations: ['ICH S3A / S3B'], description: 'Toxicokinetics and repeated-dose tissue distribution.' },
  reproductive_toxicity: { ich: ['S5'], regulations: ['ICH S5(R3)'], description: 'Reproductive and developmental toxicity.' },
  biotech_safety: { ich: ['S6'], regulations: ['ICH S6(R1)'], description: 'Preclinical safety of biotechnology-derived products.' },
  safety_pharmacology: { ich: ['S7A', 'S7B'], regulations: ['ICH S7A / S7B'], description: 'Safety pharmacology studies.' },
  nonclinical_for_clinical: { ich: ['M3'], regulations: ['ICH M3(R2)'], description: 'Nonclinical safety studies to support clinical trials.' },
  anticancer_nonclinical: { ich: ['S9'], regulations: ['ICH S9'], description: 'Nonclinical evaluation for anticancer pharmaceuticals.' },
  // ── Multidisciplinary / submission ────────────────────────────────────────
  ctd: { ich: ['M4'], regulations: ['ICH M4'], description: 'Common Technical Document organization.' },
  ectd: { ich: ['M8'], regulations: ['ICH M8'], description: 'Electronic Common Technical Document.' },
  mutagenic_impurities: { ich: ['M7'], regulations: ['ICH M7(R2)'], description: 'Assessment and control of mutagenic impurities.' },
  bcs_biowaiver: { ich: ['M9'], regulations: ['ICH M9'], description: 'BCS-based biowaivers.' },
  bioanalytical_validation: { ich: ['M10'], regulations: ['ICH M10'], description: 'Bioanalytical method validation.' },
  drug_interactions: { ich: ['M12'], regulations: ['ICH M12'], description: 'Drug interaction studies.' },
  meddra: { ich: ['M1'], regulations: ['ICH M1 (MedDRA)'], description: 'Medical Dictionary for Regulatory Activities.' },
};

export interface ResolvedGuideline {
  code: string;
  title: string | null;
  category: string | null;
}

export interface GuidanceResult {
  topic: string;
  found: boolean;
  ichGuidelines: ResolvedGuideline[];
  regulations: string[];
  description: string;
}

/**
 * Resolve the governing guidance for a regulatory topic. ICH codes are resolved
 * to titles via the catalog (title null when a code is not in the catalog).
 * Pure / deterministic. `found` is false for an unmodeled topic.
 */
export function getGuidanceFor(topic: string): GuidanceResult {
  const key = String(topic ?? '').trim().toLowerCase();
  const entry = GUIDANCE_MAP[key];
  if (!entry) {
    return { topic: key, found: false, ichGuidelines: [], regulations: [], description: '' };
  }
  const ichGuidelines: ResolvedGuideline[] = entry.ich.map((code) => {
    const g = getGuideline(code);
    return { code, title: g?.title ?? null, category: g?.category ?? null };
  });
  return { topic: key, found: true, ichGuidelines, regulations: entry.regulations, description: entry.description };
}

/** The list of modeled guidance topics. */
export function listGuidanceTopics(): string[] {
  return Object.keys(GUIDANCE_MAP).sort();
}
