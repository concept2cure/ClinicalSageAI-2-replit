/**
 * Schedule-of-Events templates — regulatory-aware milestone blueprints.
 *
 * AnA uses these as the deterministic backbone for generating a project's
 * schedule of events. Each template is keyed by submission/project type and
 * lists the canonical milestones for that pathway, with an offset (days from
 * the baseline/anchor date), a category (swimlane), critical-path flag, the
 * regulatory basis, and the owning role. The generator then shifts/compresses
 * these offsets to fit the project's goals and overall target date.
 *
 * No LLM, no RNG: the blueprint is pure data so a generated schedule is
 * explainable and reproducible. AnA layers narrative + amendments on top.
 *
 * @module server/services/projects/schedule-of-events/templates
 */

export type MilestoneCategory =
  | 'regulatory'
  | 'clinical'
  | 'cmc'
  | 'quality'
  | 'nonclinical'
  | 'internal'
  | 'submission';

export interface MilestoneTemplate {
  key: string;
  title: string;
  category: MilestoneCategory;
  /** Days from the schedule baseline (anchor) date. */
  offsetDays: number;
  isCritical: boolean;
  regulatoryBasis?: string;
  ownerRole?: string;
  /** Keys of milestones this one depends on. */
  dependsOn?: string[];
  description?: string;
}

export interface ScheduleTemplate {
  /** Canonical project/submission type this blueprint serves. */
  type: string;
  label: string;
  /** Regulatory framework the milestones are grounded in. */
  framework: string;
  /** Nominal total duration in days (baseline → final submission). */
  nominalDurationDays: number;
  milestones: MilestoneTemplate[];
}

const IND: ScheduleTemplate = {
  type: 'IND',
  label: 'IND — Investigational New Drug',
  framework: 'FDA',
  nominalDurationDays: 365,
  milestones: [
    { key: 'kickoff', title: 'Program kickoff & scope', category: 'internal', offsetDays: 0, isCritical: true, ownerRole: 'Program Lead', description: 'Confirm target indication, route, and development plan.' },
    { key: 'cmc_dev', title: 'CMC / drug substance & product readiness', category: 'cmc', offsetDays: 90, isCritical: true, regulatoryBasis: '21 CFR 312.23(a)(7)', ownerRole: 'CMC Lead', dependsOn: ['kickoff'] },
    { key: 'nonclinical', title: 'Nonclinical / toxicology package complete', category: 'nonclinical', offsetDays: 150, isCritical: true, regulatoryBasis: '21 CFR 312.23(a)(8)', ownerRole: 'Nonclinical Lead', dependsOn: ['kickoff'] },
    { key: 'pre_ind_meeting', title: 'Pre-IND meeting with FDA', category: 'regulatory', offsetDays: 180, isCritical: true, regulatoryBasis: 'FDA Pre-IND Consultation Program', ownerRole: 'Regulatory Lead', dependsOn: ['cmc_dev', 'nonclinical'] },
    { key: 'clinical_protocol', title: 'Clinical protocol & investigator brochure', category: 'clinical', offsetDays: 240, isCritical: true, regulatoryBasis: '21 CFR 312.23(a)(5)-(6)', ownerRole: 'Clinical Lead', dependsOn: ['pre_ind_meeting'] },
    { key: 'fda_forms', title: 'FDA forms (1571/1572) & administrative', category: 'regulatory', offsetDays: 300, isCritical: false, regulatoryBasis: '21 CFR 312.23(a)(1)', ownerRole: 'Regulatory Ops' },
    { key: 'internal_qc', title: 'Internal QC & cross-reference review', category: 'quality', offsetDays: 340, isCritical: true, ownerRole: 'QA Lead', dependsOn: ['clinical_protocol', 'cmc_dev', 'nonclinical'] },
    { key: 'ind_submission', title: 'IND submission to FDA', category: 'submission', offsetDays: 365, isCritical: true, regulatoryBasis: '21 CFR 312.20', ownerRole: 'Regulatory Lead', dependsOn: ['internal_qc', 'fda_forms'] },
    { key: 'ind_safe_to_proceed', title: '30-day safety review window', category: 'regulatory', offsetDays: 395, isCritical: true, regulatoryBasis: '21 CFR 312.40(b)', ownerRole: 'Regulatory Lead', dependsOn: ['ind_submission'] },
  ],
};

const NDA: ScheduleTemplate = {
  type: 'NDA',
  label: 'NDA — New Drug Application',
  framework: 'FDA',
  nominalDurationDays: 540,
  milestones: [
    { key: 'kickoff', title: 'NDA program kickoff', category: 'internal', offsetDays: 0, isCritical: true, ownerRole: 'Program Lead' },
    { key: 'pre_nda_meeting', title: 'Pre-NDA meeting with FDA', category: 'regulatory', offsetDays: 90, isCritical: true, regulatoryBasis: 'PDUFA — Pre-NDA/BLA meeting', ownerRole: 'Regulatory Lead', dependsOn: ['kickoff'] },
    { key: 'm3_quality', title: 'Module 3 — Quality complete', category: 'cmc', offsetDays: 210, isCritical: true, regulatoryBasis: 'ICH CTD M4', ownerRole: 'CMC Lead', dependsOn: ['kickoff'] },
    { key: 'm4_nonclinical', title: 'Module 4 — Nonclinical complete', category: 'nonclinical', offsetDays: 240, isCritical: false, regulatoryBasis: 'ICH CTD M4', ownerRole: 'Nonclinical Lead' },
    { key: 'm5_clinical', title: 'Module 5 — Clinical study reports complete', category: 'clinical', offsetDays: 360, isCritical: true, regulatoryBasis: 'ICH CTD M5', ownerRole: 'Clinical Lead', dependsOn: ['kickoff'] },
    { key: 'm2_summaries', title: 'Module 2 — Summaries & overviews', category: 'regulatory', offsetDays: 450, isCritical: true, regulatoryBasis: 'ICH CTD M2', ownerRole: 'Medical Writing', dependsOn: ['m3_quality', 'm5_clinical'] },
    { key: 'nda_qc', title: 'eCTD QC & publishing validation', category: 'quality', offsetDays: 510, isCritical: true, ownerRole: 'Submission Ops', dependsOn: ['m2_summaries'] },
    { key: 'nda_submission', title: 'NDA submission to FDA', category: 'submission', offsetDays: 540, isCritical: true, regulatoryBasis: '21 CFR 314.50', ownerRole: 'Regulatory Lead', dependsOn: ['nda_qc'] },
  ],
};

const BLA: ScheduleTemplate = {
  ...NDA,
  type: 'BLA',
  label: 'BLA — Biologics License Application',
  milestones: NDA.milestones.map((m) =>
    m.key === 'nda_submission'
      ? { ...m, key: 'bla_submission', title: 'BLA submission to FDA', regulatoryBasis: '21 CFR 601.2' }
      : m.key === 'nda_qc'
        ? { ...m, key: 'bla_qc' }
        : m.key === 'pre_nda_meeting'
          ? { ...m, key: 'pre_bla_meeting', title: 'Pre-BLA meeting with FDA' }
          : m
  ),
};

const FIVE_TEN_K: ScheduleTemplate = {
  type: '510K',
  label: '510(k) — Premarket Notification',
  framework: 'FDA',
  nominalDurationDays: 270,
  milestones: [
    { key: 'kickoff', title: 'Project setup & device definition', category: 'internal', offsetDays: 0, isCritical: true, ownerRole: 'Program Lead' },
    { key: 'device_description', title: 'Device description & intended use', category: 'regulatory', offsetDays: 30, isCritical: true, regulatoryBasis: '21 CFR 807.92', ownerRole: 'Regulatory Lead', dependsOn: ['kickoff'] },
    { key: 'predicate', title: 'Predicate identification & comparison', category: 'regulatory', offsetDays: 60, isCritical: true, regulatoryBasis: '21 CFR 807.87(f)', ownerRole: 'Regulatory Lead', dependsOn: ['device_description'] },
    { key: 'bench_testing', title: 'Performance / bench testing complete', category: 'quality', offsetDays: 120, isCritical: true, regulatoryBasis: 'FDA recognized consensus standards', ownerRole: 'R&D Lead', dependsOn: ['device_description'] },
    { key: 'biocompatibility', title: 'Biocompatibility evaluation', category: 'quality', offsetDays: 150, isCritical: false, regulatoryBasis: 'ISO 10993-1', ownerRole: 'R&D Lead' },
    { key: 'clinical_eval', title: 'Clinical evaluation (if required)', category: 'clinical', offsetDays: 180, isCritical: false, ownerRole: 'Clinical Lead', dependsOn: ['predicate'] },
    { key: 'labeling', title: 'Labeling & IFU finalized', category: 'regulatory', offsetDays: 210, isCritical: true, regulatoryBasis: '21 CFR 801', ownerRole: 'Regulatory Lead', dependsOn: ['device_description'] },
    { key: 'pre_sub', title: 'Pre-Submission (Q-Sub) meeting', category: 'regulatory', offsetDays: 90, isCritical: false, regulatoryBasis: 'FDA Q-Submission Program', ownerRole: 'Regulatory Lead', dependsOn: ['predicate'] },
    { key: 'final_qc', title: 'eSTAR / submission QC', category: 'quality', offsetDays: 255, isCritical: true, ownerRole: 'QA Lead', dependsOn: ['bench_testing', 'labeling'] },
    { key: 'k_submission', title: '510(k) submission to FDA', category: 'submission', offsetDays: 270, isCritical: true, regulatoryBasis: '21 CFR 807 Subpart E', ownerRole: 'Regulatory Lead', dependsOn: ['final_qc'] },
  ],
};

const PMA: ScheduleTemplate = {
  type: 'PMA',
  label: 'PMA — Premarket Approval',
  framework: 'FDA',
  nominalDurationDays: 540,
  milestones: [
    { key: 'kickoff', title: 'PMA program kickoff', category: 'internal', offsetDays: 0, isCritical: true, ownerRole: 'Program Lead' },
    { key: 'pre_sub', title: 'Pre-Submission (Q-Sub) meeting', category: 'regulatory', offsetDays: 60, isCritical: true, regulatoryBasis: 'FDA Q-Submission Program', ownerRole: 'Regulatory Lead', dependsOn: ['kickoff'] },
    { key: 'nonclinical', title: 'Nonclinical / bench & animal testing', category: 'nonclinical', offsetDays: 180, isCritical: true, regulatoryBasis: '21 CFR 814.20(b)(6)', ownerRole: 'R&D Lead', dependsOn: ['kickoff'] },
    { key: 'pivotal_trial', title: 'Pivotal clinical trial complete', category: 'clinical', offsetDays: 420, isCritical: true, regulatoryBasis: '21 CFR 814.20(b)(6)(ii)', ownerRole: 'Clinical Lead', dependsOn: ['pre_sub'] },
    { key: 'manufacturing', title: 'Manufacturing & QS information', category: 'cmc', offsetDays: 450, isCritical: true, regulatoryBasis: '21 CFR 820', ownerRole: 'Quality Lead' },
    { key: 'pma_qc', title: 'PMA module QC & assembly', category: 'quality', offsetDays: 510, isCritical: true, ownerRole: 'Submission Ops', dependsOn: ['pivotal_trial', 'manufacturing'] },
    { key: 'pma_submission', title: 'PMA submission to FDA', category: 'submission', offsetDays: 540, isCritical: true, regulatoryBasis: '21 CFR 814.20', ownerRole: 'Regulatory Lead', dependsOn: ['pma_qc'] },
  ],
};

const DE_NOVO: ScheduleTemplate = {
  ...FIVE_TEN_K,
  type: 'DE_NOVO',
  label: 'De Novo — Automatic Class III Designation Request',
  milestones: FIVE_TEN_K.milestones
    .filter((m) => m.key !== 'predicate')
    .map((m) =>
      m.key === 'k_submission'
        ? { ...m, key: 'denovo_submission', title: 'De Novo request submission to FDA', regulatoryBasis: '21 CFR 860 Subpart D' }
        : m
    ),
};

const CER: ScheduleTemplate = {
  type: 'CER',
  label: 'CER — Clinical Evaluation Report (EU MDR)',
  framework: 'EU MDR',
  nominalDurationDays: 240,
  milestones: [
    { key: 'kickoff', title: 'CER scope & device description', category: 'internal', offsetDays: 0, isCritical: true, regulatoryBasis: 'MDR 2017/745 Annex XIV', ownerRole: 'Clinical Lead' },
    { key: 'cer_plan', title: 'Clinical evaluation plan', category: 'clinical', offsetDays: 30, isCritical: true, regulatoryBasis: 'MEDDEV 2.7/1 Rev 4', ownerRole: 'Clinical Lead', dependsOn: ['kickoff'] },
    { key: 'lit_search', title: 'Systematic literature search', category: 'clinical', offsetDays: 90, isCritical: true, regulatoryBasis: 'MEDDEV 2.7/1 Rev 4 §8', ownerRole: 'Medical Writing', dependsOn: ['cer_plan'] },
    { key: 'data_appraisal', title: 'Clinical data appraisal & analysis', category: 'clinical', offsetDays: 150, isCritical: true, ownerRole: 'Clinical Lead', dependsOn: ['lit_search'] },
    { key: 'benefit_risk', title: 'Benefit-risk determination', category: 'regulatory', offsetDays: 195, isCritical: true, regulatoryBasis: 'MDR Annex I §1, §8', ownerRole: 'Regulatory Lead', dependsOn: ['data_appraisal'] },
    { key: 'expert_review', title: 'Expert / notified body review', category: 'quality', offsetDays: 225, isCritical: false, ownerRole: 'QA Lead', dependsOn: ['benefit_risk'] },
    { key: 'cer_final', title: 'CER finalized & approved', category: 'submission', offsetDays: 240, isCritical: true, regulatoryBasis: 'MDR Annex XIV Part A', ownerRole: 'Regulatory Lead', dependsOn: ['expert_review'] },
  ],
};

const IVDR: ScheduleTemplate = {
  type: 'IVDR',
  label: 'IVDR — In Vitro Diagnostic Regulation',
  framework: 'EU IVDR',
  nominalDurationDays: 300,
  milestones: [
    { key: 'kickoff', title: 'IVD classification & scope', category: 'internal', offsetDays: 0, isCritical: true, regulatoryBasis: 'IVDR 2017/746 Annex VIII', ownerRole: 'Regulatory Lead' },
    { key: 'pms_plan', title: 'Performance evaluation plan', category: 'clinical', offsetDays: 45, isCritical: true, regulatoryBasis: 'IVDR Annex XIII', ownerRole: 'Clinical Lead', dependsOn: ['kickoff'] },
    { key: 'scientific_validity', title: 'Scientific validity report', category: 'clinical', offsetDays: 120, isCritical: true, regulatoryBasis: 'IVDR Annex XIII Part A', ownerRole: 'Clinical Lead', dependsOn: ['pms_plan'] },
    { key: 'analytical_perf', title: 'Analytical performance complete', category: 'quality', offsetDays: 180, isCritical: true, ownerRole: 'R&D Lead', dependsOn: ['pms_plan'] },
    { key: 'clinical_perf', title: 'Clinical performance complete', category: 'clinical', offsetDays: 240, isCritical: true, ownerRole: 'Clinical Lead', dependsOn: ['scientific_validity'] },
    { key: 'tech_doc', title: 'Technical documentation assembled', category: 'regulatory', offsetDays: 280, isCritical: true, regulatoryBasis: 'IVDR Annex II/III', ownerRole: 'Regulatory Lead', dependsOn: ['analytical_perf', 'clinical_perf'] },
    { key: 'nb_submission', title: 'Notified body conformity submission', category: 'submission', offsetDays: 300, isCritical: true, ownerRole: 'Regulatory Lead', dependsOn: ['tech_doc'] },
  ],
};

const MAA: ScheduleTemplate = {
  ...NDA,
  type: 'MAA',
  label: 'MAA — Marketing Authorisation Application (EMA)',
  framework: 'EMA',
  milestones: NDA.milestones.map((m) =>
    m.key === 'pre_nda_meeting'
      ? { ...m, key: 'scientific_advice', title: 'EMA scientific advice', regulatoryBasis: 'EMA Scientific Advice / Protocol Assistance' }
      : m.key === 'nda_submission'
        ? { ...m, key: 'maa_submission', title: 'MAA submission to EMA', regulatoryBasis: 'Regulation (EC) 726/2004' }
        : m.key === 'nda_qc'
          ? { ...m, key: 'maa_qc' }
          : m
  ),
};

const GENERIC: ScheduleTemplate = {
  type: 'GENERIC',
  label: 'Regulatory program',
  framework: 'FDA',
  nominalDurationDays: 270,
  milestones: [
    { key: 'kickoff', title: 'Program kickoff & scope', category: 'internal', offsetDays: 0, isCritical: true, ownerRole: 'Program Lead' },
    { key: 'evidence', title: 'Evidence & data package', category: 'clinical', offsetDays: 90, isCritical: true, ownerRole: 'Clinical Lead', dependsOn: ['kickoff'] },
    { key: 'authoring', title: 'Document authoring', category: 'regulatory', offsetDays: 180, isCritical: true, ownerRole: 'Medical Writing', dependsOn: ['evidence'] },
    { key: 'qc', title: 'QC & cross-reference review', category: 'quality', offsetDays: 240, isCritical: true, ownerRole: 'QA Lead', dependsOn: ['authoring'] },
    { key: 'submission', title: 'Submission to authority', category: 'submission', offsetDays: 270, isCritical: true, ownerRole: 'Regulatory Lead', dependsOn: ['qc'] },
  ],
};

const TEMPLATES: Record<string, ScheduleTemplate> = {
  IND,
  NDA,
  BLA,
  '510K': FIVE_TEN_K,
  PMA,
  DE_NOVO,
  CER,
  IVDR,
  MAA,
  EUA: { ...GENERIC, type: 'EUA', label: 'EUA — Emergency Use Authorization', framework: 'FDA' },
  GENERIC,
};

/** Resolve a blueprint for a (possibly messy) submission/project type. */
export function getScheduleTemplate(projectType: string | null | undefined): ScheduleTemplate {
  if (!projectType) return GENERIC;
  const key = projectType.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (
    TEMPLATES[key] ??
    TEMPLATES[key.replace(/_/g, '')] ??
    GENERIC
  );
}

export function listSupportedTypes(): string[] {
  return Object.keys(TEMPLATES);
}
