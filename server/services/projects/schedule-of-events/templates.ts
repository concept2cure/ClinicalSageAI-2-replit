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

/**
 * Derive one template's milestones from another, keeping the DEPENDENCY GRAPH
 * coherent. Several templates are variations on a base (BLA/MAA on NDA, De Novo
 * on 510(k)) that rename or drop milestones — but a rename left every
 * `dependsOn` pointing at the OLD key, and a drop left dependants pointing at a
 * milestone that no longer exists. Those dangling edges are silently ignored by
 * the generator, so a real critical-path dependency just disappeared (e.g. BLA's
 * submission no longer depended on its own QC gate).
 *
 * This remaps every `dependsOn` through the rename map and removes references to
 * dropped milestones, so a derived template's graph is always internally valid.
 */
function deriveMilestones(
  source: MilestoneTemplate[],
  opts: {
    /** oldKey → fields to overwrite (must include the new `key`). */
    rename?: Record<string, Partial<MilestoneTemplate> & { key: string }>;
    /** Milestone keys removed entirely from the derived template. */
    drop?: string[];
  },
): MilestoneTemplate[] {
  const rename = opts.rename ?? {};
  const dropped = new Set(opts.drop ?? []);
  const keyMap = new Map<string, string>(
    Object.entries(rename).map(([oldKey, patch]) => [oldKey, patch.key]),
  );

  return source
    .filter((m) => !dropped.has(m.key))
    .map((m) => {
      const next: MilestoneTemplate = { ...m, ...(rename[m.key] ?? {}) };
      if (next.dependsOn) {
        next.dependsOn = next.dependsOn
          .filter((d) => !dropped.has(d))
          .map((d) => keyMap.get(d) ?? d);
      }
      return next;
    });
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
  milestones: deriveMilestones(NDA.milestones, {
    rename: {
      nda_submission: { key: 'bla_submission', title: 'BLA submission to FDA', regulatoryBasis: '21 CFR 601.2' },
      nda_qc: { key: 'bla_qc' },
      pre_nda_meeting: { key: 'pre_bla_meeting', title: 'Pre-BLA meeting with FDA' },
    },
  }),
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
  // A De Novo has no predicate by definition — drop that milestone AND every
  // dependency on it (previously left dangling on clinical_eval / pre_sub).
  milestones: deriveMilestones(FIVE_TEN_K.milestones, {
    drop: ['predicate'],
    rename: {
      k_submission: { key: 'denovo_submission', title: 'De Novo request submission to FDA', regulatoryBasis: '21 CFR 860 Subpart D' },
    },
  }),
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
  milestones: deriveMilestones(NDA.milestones, {
    rename: {
      pre_nda_meeting: { key: 'scientific_advice', title: 'EMA scientific advice', regulatoryBasis: 'EMA Scientific Advice / Protocol Assistance' },
      nda_submission: { key: 'maa_submission', title: 'MAA submission to EMA', regulatoryBasis: 'Regulation (EC) 726/2004' },
      nda_qc: { key: 'maa_qc' },
    },
  }),
};

/**
 * Japan — PMDA Shōnin (承認), marketing approval under the PMD Act. Distinct from
 * a US/EU filing in three ways the schedule must respect: PMDA face-to-face advice
 * (対面助言) is booked well ahead of filing, a Japanese clinical data / bridging
 * strategy is decided early, and the reliability (信頼性基準) + GMP conformity
 * inspections run against the dossier before approval.
 */
const SHONIN: ScheduleTemplate = {
  type: 'SHONIN',
  label: 'Shōnin — Marketing approval application (PMDA)',
  framework: 'PMDA',
  nominalDurationDays: 540,
  milestones: [
    { key: 'kickoff', title: 'Japan strategy & scope', category: 'internal', offsetDays: 0, isCritical: true, ownerRole: 'Program Lead', description: 'Confirm Japanese indication, partner/MAH structure, and data strategy.' },
    { key: 'bridging_strategy', title: 'Bridging / Japanese data strategy', category: 'clinical', offsetDays: 60, isCritical: true, regulatoryBasis: 'ICH E5 (ethnic factors); PMDA basic principles', ownerRole: 'Clinical Lead', dependsOn: ['kickoff'] },
    { key: 'pmda_consultation', title: 'PMDA face-to-face advice (対面助言)', category: 'regulatory', offsetDays: 150, isCritical: true, regulatoryBasis: 'PMDA consultation services (taimen-jogen)', ownerRole: 'Regulatory Lead', dependsOn: ['bridging_strategy'] },
    { key: 'ctn', title: 'Clinical trial notification (治験届) if Japanese data required', category: 'clinical', offsetDays: 210, isCritical: false, regulatoryBasis: 'PMD Act Article 80-2', ownerRole: 'Clinical Lead', dependsOn: ['pmda_consultation'] },
    { key: 'jp_clinical', title: 'Japanese clinical / bridging study complete', category: 'clinical', offsetDays: 390, isCritical: true, ownerRole: 'Clinical Lead', dependsOn: ['ctn'] },
    { key: 'gmp_compliance', title: 'GMP compliance & manufacturing site readiness', category: 'quality', offsetDays: 420, isCritical: true, regulatoryBasis: 'PMD Act Article 14(2); MHLW GMP Ordinance', ownerRole: 'CMC Lead', dependsOn: ['kickoff'] },
    { key: 'reliability_standards', title: 'Reliability standards (信頼性基準) data package check', category: 'quality', offsetDays: 460, isCritical: true, regulatoryBasis: 'PMD Act Article 14(3); MHLW reliability standards', ownerRole: 'QA Lead', dependsOn: ['jp_clinical'] },
    { key: 'ctd_jp', title: 'CTD-JP (Module 1 Japanese annex) assembled', category: 'regulatory', offsetDays: 500, isCritical: true, regulatoryBasis: 'PMDA eCTD notification (jp-regional backbone)', ownerRole: 'Submission Ops', dependsOn: ['reliability_standards', 'gmp_compliance'] },
    { key: 'shonin_submission', title: 'Shōnin application submitted to PMDA', category: 'submission', offsetDays: 540, isCritical: true, regulatoryBasis: 'PMD Act Article 14 (manufacturing/marketing approval)', ownerRole: 'Regulatory Lead', dependsOn: ['ctd_jp'] },
  ],
};

/**
 * Canada — Health Canada New Drug Submission. The Canadian clock has an explicit
 * screening gate before scientific review, so the schedule models screening as a
 * distinct milestone rather than folding it into submission.
 */
const NDS: ScheduleTemplate = {
  type: 'NDS',
  label: 'NDS — New Drug Submission (Health Canada)',
  framework: 'Health Canada',
  nominalDurationDays: 540,
  milestones: [
    { key: 'kickoff', title: 'Program kickoff & Canadian scope', category: 'internal', offsetDays: 0, isCritical: true, ownerRole: 'Program Lead' },
    { key: 'presubmission_meeting', title: 'Pre-submission meeting with Health Canada', category: 'regulatory', offsetDays: 120, isCritical: true, regulatoryBasis: 'HC Guidance — Pre-submission meetings', ownerRole: 'Regulatory Lead', dependsOn: ['kickoff'] },
    { key: 'cmc_package', title: 'Quality (CMC) package complete', category: 'cmc', offsetDays: 300, isCritical: true, regulatoryBasis: 'Food and Drug Regulations C.08.002(2)', ownerRole: 'CMC Lead', dependsOn: ['kickoff'] },
    { key: 'clinical_package', title: 'Clinical & nonclinical evidence complete', category: 'clinical', offsetDays: 390, isCritical: true, regulatoryBasis: 'Food and Drug Regulations C.08.002(2)', ownerRole: 'Clinical Lead', dependsOn: ['presubmission_meeting'] },
    { key: 'ca_module1', title: 'Canadian Module 1 assembled (product monograph, forms)', category: 'regulatory', offsetDays: 460, isCritical: true, regulatoryBasis: 'HC Guidance — Preparation of Regulatory Activities in eCTD (ca-regional backbone)', ownerRole: 'Submission Ops', dependsOn: ['cmc_package', 'clinical_package'] },
    { key: 'nds_qc', title: 'eCTD QC & publishing validation', category: 'quality', offsetDays: 510, isCritical: true, ownerRole: 'Submission Ops', dependsOn: ['ca_module1'] },
    { key: 'nds_submission', title: 'NDS filed to Health Canada (CESG)', category: 'submission', offsetDays: 540, isCritical: true, regulatoryBasis: 'Food and Drug Regulations C.08.002', ownerRole: 'Regulatory Lead', dependsOn: ['nds_qc'] },
    { key: 'screening_acceptance', title: 'Screening acceptance', category: 'regulatory', offsetDays: 585, isCritical: true, regulatoryBasis: 'HC Management of Drug Submissions — screening', ownerRole: 'Regulatory Lead', dependsOn: ['nds_submission'] },
  ],
};

/**
 * FDA device request types (CDRH/CBER). These are short, meeting- or
 * decision-driven interactions rather than marketing applications, so their
 * schedules are measured in weeks and anchor on the FDA feedback clock. They
 * complete the device planning set alongside 510K / DE_NOVO / PMA.
 */
const Q_SUB: ScheduleTemplate = {
  type: 'Q_SUB',
  label: 'Q-Sub — Q-Submission / Pre-Submission (CDRH)',
  framework: 'FDA',
  nominalDurationDays: 150,
  milestones: [
    { key: 'kickoff', title: 'Define feedback objectives', category: 'internal', offsetDays: 0, isCritical: true, ownerRole: 'Regulatory Lead', description: 'Decide what decision the FDA feedback must unblock.' },
    { key: 'questions_drafted', title: 'Specific questions & sponsor positions drafted', category: 'regulatory', offsetDays: 30, isCritical: true, regulatoryBasis: 'FDA Q-Submission Program guidance', ownerRole: 'Regulatory Lead', dependsOn: ['kickoff'] },
    { key: 'background_package', title: 'Device description & background package', category: 'regulatory', offsetDays: 45, isCritical: true, ownerRole: 'R&D Lead', dependsOn: ['kickoff'] },
    { key: 'qsub_submission', title: 'Q-Sub submitted to CDRH', category: 'submission', offsetDays: 60, isCritical: true, regulatoryBasis: 'FDA Q-Submission Program guidance', ownerRole: 'Regulatory Lead', dependsOn: ['questions_drafted', 'background_package'] },
    { key: 'fda_feedback', title: 'FDA written feedback (~70-day goal)', category: 'regulatory', offsetDays: 130, isCritical: true, regulatoryBasis: 'FDA Q-Submission Program — 70-day feedback goal', ownerRole: 'Regulatory Lead', dependsOn: ['qsub_submission'] },
    { key: 'meeting', title: 'Meeting / teleconference with review team', category: 'regulatory', offsetDays: 140, isCritical: false, ownerRole: 'Regulatory Lead', dependsOn: ['fda_feedback'] },
    { key: 'integrate_feedback', title: 'Feedback integrated into development plan', category: 'internal', offsetDays: 150, isCritical: true, ownerRole: 'Program Lead', dependsOn: ['fda_feedback'] },
  ],
};

const IDE: ScheduleTemplate = {
  type: 'IDE',
  label: 'IDE — Investigational Device Exemption',
  framework: 'FDA',
  nominalDurationDays: 270,
  milestones: [
    { key: 'kickoff', title: 'Study concept & risk determination', category: 'internal', offsetDays: 0, isCritical: true, regulatoryBasis: '21 CFR 812.3(m) significant risk determination', ownerRole: 'Program Lead' },
    { key: 'presub', title: 'Pre-Sub on study design (recommended)', category: 'regulatory', offsetDays: 60, isCritical: false, regulatoryBasis: 'FDA Q-Submission Program guidance', ownerRole: 'Regulatory Lead', dependsOn: ['kickoff'] },
    { key: 'bench_animal', title: 'Bench & animal testing supporting safety', category: 'nonclinical', offsetDays: 120, isCritical: true, regulatoryBasis: '21 CFR 812.27 (report of prior investigations)', ownerRole: 'R&D Lead', dependsOn: ['kickoff'] },
    { key: 'investigational_plan', title: 'Investigational plan & protocol', category: 'clinical', offsetDays: 165, isCritical: true, regulatoryBasis: '21 CFR 812.25', ownerRole: 'Clinical Lead', dependsOn: ['presub'] },
    { key: 'irb_informed_consent', title: 'IRB approval & informed consent materials', category: 'clinical', offsetDays: 200, isCritical: true, regulatoryBasis: '21 CFR 812.42; 21 CFR 50', ownerRole: 'Clinical Lead', dependsOn: ['investigational_plan'] },
    { key: 'manufacturing_info', title: 'Manufacturing information & labeling', category: 'quality', offsetDays: 220, isCritical: true, regulatoryBasis: '21 CFR 812.20(b)(3); 812.5', ownerRole: 'CMC Lead', dependsOn: ['bench_animal'] },
    { key: 'ide_submission', title: 'IDE application submitted to FDA', category: 'submission', offsetDays: 240, isCritical: true, regulatoryBasis: '21 CFR 812.20', ownerRole: 'Regulatory Lead', dependsOn: ['investigational_plan', 'manufacturing_info', 'irb_informed_consent'] },
    { key: 'ide_decision', title: 'FDA 30-day decision window', category: 'regulatory', offsetDays: 270, isCritical: true, regulatoryBasis: '21 CFR 812.30(a)', ownerRole: 'Regulatory Lead', dependsOn: ['ide_submission'] },
  ],
};

const G513: ScheduleTemplate = {
  type: '513G',
  label: '513(g) — Request for Information on classification',
  framework: 'FDA',
  nominalDurationDays: 120,
  milestones: [
    { key: 'kickoff', title: 'Classification question defined', category: 'internal', offsetDays: 0, isCritical: true, ownerRole: 'Regulatory Lead' },
    { key: 'device_description', title: 'Device description & intended use drafted', category: 'regulatory', offsetDays: 21, isCritical: true, ownerRole: 'R&D Lead', dependsOn: ['kickoff'] },
    { key: 'classification_rationale', title: 'Proposed classification & rationale', category: 'regulatory', offsetDays: 35, isCritical: true, regulatoryBasis: '21 CFR Part 860', ownerRole: 'Regulatory Lead', dependsOn: ['device_description'] },
    { key: 'g513_submission', title: '513(g) request submitted to FDA', category: 'submission', offsetDays: 45, isCritical: true, regulatoryBasis: 'FD&C Act Section 513(g)', ownerRole: 'Regulatory Lead', dependsOn: ['classification_rationale'] },
    { key: 'fda_response', title: 'FDA written response (~60-day goal)', category: 'regulatory', offsetDays: 105, isCritical: true, regulatoryBasis: 'FDA 513(g) guidance — 60-day goal', ownerRole: 'Regulatory Lead', dependsOn: ['g513_submission'] },
    { key: 'pathway_decision', title: 'Pathway decision recorded', category: 'internal', offsetDays: 120, isCritical: true, ownerRole: 'Program Lead', dependsOn: ['fda_response'] },
  ],
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
  SHONIN,
  NDS,
  Q_SUB,
  IDE,
  '513G': G513,
  EUA: { ...GENERIC, type: 'EUA', label: 'EUA — Emergency Use Authorization', framework: 'FDA' },
  GENERIC,
};

/**
 * Aliases for how these filings are actually named in the wild. Keys are already
 * normalized (uppercase, punctuation → underscore) so they are compared against
 * the cleaned input. Non-ASCII forms matter here: "Shōnin" normalizes to
 * "SH_NIN", which would otherwise miss.
 */
const TYPE_ALIASES: Record<string, string> = {
  // Japan
  SH_NIN: 'SHONIN',
  SHONIN_JP: 'SHONIN',
  PMDA: 'SHONIN',
  JAPAN: 'SHONIN',
  JP_ECTD: 'SHONIN',
  // Canada
  NEW_DRUG_SUBMISSION: 'NDS',
  HEALTH_CANADA: 'NDS',
  CA_ECTD: 'NDS',
  // FDA device requests
  Q_SUBMISSION: 'Q_SUB',
  QSUB: 'Q_SUB',
  PRE_SUB: 'Q_SUB',
  PRESUB: 'Q_SUB',
  PRE_SUBMISSION: 'Q_SUB',
  SECTION_513_G: '513G',
  '513_G': '513G',
  RFI_513G: '513G',
  // Common long forms
  INVESTIGATIONAL_DEVICE_EXEMPTION: 'IDE',
};

/** Resolve a blueprint for a (possibly messy) submission/project type. */
export function getScheduleTemplate(projectType: string | null | undefined): ScheduleTemplate {
  if (!projectType) return GENERIC;
  // Normalize any punctuation/spacing to underscores so real-world inputs like
  // "510(k)", "510-K", or "de novo" resolve. The collapsed (underscore-free)
  // variant catches "510_K" → "510K".
  const cleaned = projectType
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const collapsed = cleaned.replace(/_/g, '');
  const aliased = TYPE_ALIASES[cleaned] ?? TYPE_ALIASES[collapsed];
  return (
    TEMPLATES[cleaned] ??
    TEMPLATES[collapsed] ??
    (aliased ? TEMPLATES[aliased] : undefined) ??
    GENERIC
  );
}

export function listSupportedTypes(): string[] {
  return Object.keys(TEMPLATES);
}
