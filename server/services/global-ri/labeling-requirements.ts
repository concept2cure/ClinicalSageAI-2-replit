/**
 * Cross-market product-labeling requirements expert.
 *
 * The mandatory labeling document for an approved medicine — its required
 * sections, ordering, and headings — is fixed by regulation and differs by
 * health authority. This service encodes the required labeling sections per
 * market and assesses a sponsor's draft against them, surfacing exactly which
 * required sections are missing before submission.
 *
 * Markets:
 *  - FDA  — US Prescribing Information (PI), Physician Labeling Rule
 *           (21 CFR 201.56 / 201.57).
 *  - EMA  — Summary of Product Characteristics (SmPC), QRD template numbered
 *           sections per Directive 2001/83/EC Art. 11.
 *  - PMDA — Japanese prescription-drug package insert (添付文書), in the
 *           numbered format of 薬生発0608第1号 (2017-06-08; applied from
 *           2019-04-01, already-approved products converted by 2024-03-31) and
 *           the electronic package-insert drafting rules 薬生発0611第1号
 *           (2021-06-11; applied from 2021-08-01, amended 2023-02-17). Every
 *           item from 警告 onward is numbered and an item with nothing to state
 *           is left as a missing number (欠番), so most items are
 *           `conditional`. Drugs only: Japanese device and IVD inserts follow
 *           separate drafting rules that are not modelled here.
 *
 * Each section carries a `requirement`: absent or 'required' means a draft
 * without it is not ready; 'conditional' means the item may legitimately be
 * absent (the FDA BOXED WARNING is conditional and is not modelled; the JP
 * 警告 is modelled as conditional). A sub-item inherits a conditional parent.
 * A heading the current format abolished (OBSOLETE_LABELING_SECTIONS) is a
 * blocking FORMAT_OBSOLETE finding that names the replacement item.
 *
 * The section lists capture the document headings; sponsor SOPs and the
 * current agency templates remain authoritative for edge cases (this is a
 * readiness aid, honest-by-construction). Every PMDA item carries a
 * RegulatoryBasis; items not seen in the regulator's text are `recall`.
 * Facts relied on: docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-jp-package-insert-format-facts.md.
 *
 * Pure / deterministic — no DB, no IO.
 *
 * Reference: 21 CFR 201.57 (FDA Physician Labeling Rule content/format);
 * EMA QRD template / Directive 2001/83/EC Art. 11 (SmPC); 薬生発0608第1号 and
 * 薬生発0611第1号 (医療用医薬品の(電子化された)添付文書の記載要領).
 *
 * @module server/services/global-ri/labeling-requirements
 */

import type { RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';

export type LabelMarket = 'FDA' | 'EMA' | 'PMDA';

/** 'required': a draft without it is not ready. 'conditional': it may legitimately be absent. */
export type LabelingRequirement = 'required' | 'conditional';

export interface LabelingSection {
  /** Stable section code (e.g. 'us_indications_usage'). */
  code: string;
  /** Human-readable section title. */
  title: string;
  /** Absent means 'required'. A sub-item of a conditional item is conditional. */
  requirement?: LabelingRequirement;
  /** The item number the format prints (PMDA: '9', '9.2'). */
  number?: string;
  /** Numbered sub-items (PMDA 9.1–9.8, 10.1/10.2, 11.1/11.2). */
  children?: LabelingSection[];
  /** Where the heading comes from. */
  basis?: RegulatoryBasis[];
}

// ── Japanese package insert: bases ──────────────────────────────────────────

const JP_CHECKED = '2026-10-05';
const JP_REREAD_NOTE =
  'heading and number seen in a search extract of the regulator-hosted PDF; verbatim re-read owed (mhlw.go.jp / pmda.go.jp egress-blocked)';

/** 薬生発0611第1号 (2021-06-11): the operative electronic package-insert drafting rules. */
const JP_0611: RegulatoryBasis = {
  ref: '薬生発0611第1号 (2021-06-11) 医療用医薬品の電子化された添付文書の記載要領について',
  confidence: 'regulator-text',
  url: 'https://www.mhlw.go.jp/content/11120000/000805981.pdf',
  checked: JP_CHECKED,
  note: JP_REREAD_NOTE,
};

/** 薬生発0608第1号 (2017-06-08): the origin of the numbered structure. */
const JP_0608: RegulatoryBasis = {
  ref: '薬生発0608第1号 (2017-06-08) 医療用医薬品の添付文書等の記載要領について',
  confidence: 'regulator-text',
  url: 'https://www.pmda.go.jp/files/000218446.pdf',
  checked: JP_CHECKED,
  note: JP_REREAD_NOTE,
};

/** Headings seen in the regulator's text (search extract). */
const JP_SEEN: RegulatoryBasis[] = [JP_0611, JP_0608];

/** Headings known only from recall until 000805981.pdf / 000218446.pdf is read. */
const JP_RECALL: RegulatoryBasis[] = [
  {
    ref: '薬生発0611第1号 / 薬生発0608第1号 — item heading and number',
    confidence: 'recall',
    url: 'https://www.mhlw.go.jp/content/11120000/000805981.pdf',
    note: 'not seen in the regulator text this session; re-read 000805981.pdf / 000218446.pdf before relying on it',
  },
];

/** Always present in an insert (recall: the always-present set was not read). */
const jpRequired = (code: string, number: string | undefined, title: string, basis: RegulatoryBasis[], children?: LabelingSection[]): LabelingSection => ({
  code, title, requirement: 'required', ...(number ? { number } : {}), ...(children ? { children } : {}), basis,
});

/** May be a missing number (欠番) when there is nothing to state. */
const jpConditional = (code: string, number: string, title: string, basis: RegulatoryBasis[], children?: LabelingSection[]): LabelingSection => ({
  code, title, requirement: 'conditional', number, ...(children ? { children } : {}), basis,
});

/**
 * The Japanese prescription-drug package insert, numbered new format
 * (薬生発0608第1号; 薬生発0611第1号). Items 1–14 with 9.1–9.4 and 11.1/11.2 were
 * seen in the regulator's text; 9.5–9.8, 10.1/10.2, 15–26 and the header are
 * recall. Only the always-present items are 'required' — that set is recall.
 */
const JP_PACKAGE_INSERT: LabelingSection[] = [
  jpRequired('jp_header', undefined, 'Header items (販売名, 一般名, 日本標準商品分類番号, 承認番号, 販売開始年月, 貯法, 有効期間, 規制区分 等)', JP_RECALL),
  jpConditional('jp_1_warnings', '1', 'Warnings (警告)', JP_SEEN),
  jpConditional('jp_2_contraindications', '2', 'Contraindications (禁忌)', JP_SEEN),
  jpRequired('jp_3_composition_description', '3', 'Composition and Product Description (組成・性状)', [...JP_SEEN, ...JP_RECALL]),
  jpRequired('jp_4_indications', '4', 'Indications (効能又は効果)', [...JP_SEEN, ...JP_RECALL]),
  jpConditional('jp_5_indications_precautions', '5', 'Precautions Related to Indications (効能又は効果に関連する注意)', JP_SEEN),
  jpRequired('jp_6_dosage_administration', '6', 'Dosage and Administration (用法及び用量)', [...JP_SEEN, ...JP_RECALL]),
  jpConditional('jp_7_dosage_precautions', '7', 'Precautions Related to Dosage and Administration (用法及び用量に関連する注意)', JP_SEEN),
  jpConditional('jp_8_important_precautions', '8', 'Important Precautions (重要な基本的注意)', JP_SEEN),
  jpConditional('jp_9_specific_populations', '9', 'Precautions for Patients with Specific Backgrounds (特定の背景を有する患者に関する注意)', JP_SEEN, [
    jpConditional('jp_9_1_comorbidities', '9.1', 'Patients with Complications or a History of Disease (合併症・既往歴等のある患者)', JP_SEEN),
    jpConditional('jp_9_2_renal_impairment', '9.2', 'Patients with Renal Impairment (腎機能障害患者)', JP_SEEN),
    jpConditional('jp_9_3_hepatic_impairment', '9.3', 'Patients with Hepatic Impairment (肝機能障害患者)', JP_SEEN),
    jpConditional('jp_9_4_reproductive_potential', '9.4', 'Individuals of Reproductive Potential (生殖能を有する者)', JP_SEEN),
    jpConditional('jp_9_5_pregnant', '9.5', 'Pregnant Women (妊婦)', JP_RECALL),
    jpConditional('jp_9_6_breastfeeding', '9.6', 'Breastfeeding Women (授乳婦)', JP_RECALL),
    jpConditional('jp_9_7_pediatric', '9.7', 'Pediatric Patients (小児等)', JP_RECALL),
    jpConditional('jp_9_8_elderly', '9.8', 'Elderly Patients (高齢者)', JP_RECALL),
  ]),
  jpConditional('jp_10_interactions', '10', 'Interactions (相互作用)', JP_SEEN, [
    jpConditional('jp_10_1_contraindicated_combinations', '10.1', 'Contraindicated Combinations (併用禁忌)', JP_RECALL),
    jpConditional('jp_10_2_combination_precautions', '10.2', 'Precautions for Combinations (併用注意)', JP_RECALL),
  ]),
  jpConditional('jp_11_adverse_reactions', '11', 'Adverse Reactions (副作用)', JP_SEEN, [
    jpConditional('jp_11_1_serious_adverse_reactions', '11.1', 'Clinically Significant Adverse Reactions (重大な副作用)', JP_SEEN),
    jpConditional('jp_11_2_other_adverse_reactions', '11.2', 'Other Adverse Reactions (その他の副作用)', JP_SEEN),
  ]),
  jpConditional('jp_12_lab_test_effects', '12', 'Effects on Laboratory Tests (臨床検査結果に及ぼす影響)', JP_SEEN),
  jpConditional('jp_13_overdosage', '13', 'Overdosage (過量投与)', JP_SEEN),
  jpConditional('jp_14_application_precautions', '14', 'Precautions Concerning Use (適用上の注意)', JP_SEEN),
  jpConditional('jp_15_other_precautions', '15', 'Other Precautions (その他の注意)', JP_RECALL),
  jpConditional('jp_16_pharmacokinetics', '16', 'Pharmacokinetics (薬物動態)', JP_RECALL),
  jpConditional('jp_17_clinical_studies', '17', 'Clinical Studies (臨床成績)', JP_RECALL),
  jpConditional('jp_18_pharmacology', '18', 'Pharmacology (薬効薬理)', JP_RECALL),
  jpConditional('jp_19_physicochemical', '19', 'Physicochemical Properties of the Active Ingredient (有効成分に関する理化学的知見)', JP_RECALL),
  jpConditional('jp_20_handling_precautions', '20', 'Precautions for Handling (取扱い上の注意)', JP_RECALL),
  jpConditional('jp_21_approval_conditions', '21', 'Conditions of Approval (承認条件)', JP_RECALL),
  jpRequired('jp_22_packaging', '22', 'Packaging (包装)', JP_RECALL),
  jpConditional('jp_23_references', '23', 'References (主要文献)', JP_RECALL),
  jpConditional('jp_24_reference_request_contact', '24', 'Reference Request and Contact Information (文献請求先及び問い合わせ先)', JP_RECALL),
  jpConditional('jp_25_insurance_precautions', '25', 'Precautions Concerning Health Insurance Benefits (保険給付上の注意)', JP_RECALL),
  jpRequired('jp_26_marketing_authorization_holder', '26', 'Marketing Authorization Holder etc. (製造販売業者等)', JP_RECALL),
];

/** A heading the current format abolished; a draft that still carries it is refused. */
export interface ObsoleteLabelingSection {
  code: string;
  title: string;
  /** Item numbers in the current format that replace it. */
  replacedBy: string[];
  basis: RegulatoryBasis[];
}

/** Abolished headings per market. A provided code here is a blocking FORMAT_OBSOLETE. */
export const OBSOLETE_LABELING_SECTIONS: Partial<Record<LabelMarket, ObsoleteLabelingSection[]>> = {
  PMDA: [
    {
      code: 'jp_principal_contraindications',
      title: '原則禁忌 (Relative Contraindications)',
      replacedBy: ['2', '9'],
      basis: [
        {
          ref: '医薬安全対策課 (2019-03-22) 添付文書記載要領の改正に伴う原則禁忌の取扱いについて',
          confidence: 'regulator-text',
          url: 'https://www.pmda.go.jp/files/000228953.pdf',
          checked: JP_CHECKED,
          note: 'title and the abolition of 原則禁忌 seen in a search extract of the regulator-hosted PDF; verbatim re-read owed',
        },
        JP_0608,
      ],
    },
    {
      code: 'jp_careful_administration',
      title: '慎重投与 (Careful Administration)',
      replacedBy: ['9'],
      basis: [
        {
          ref: '薬生発0608第1号 — abolition of 慎重投与',
          confidence: 'recall',
          url: 'https://www.pmda.go.jp/files/000218446.pdf',
          note: 'search summaries say it was abolished; the regulator line seen covers only 原則禁忌 — re-read before relying on it',
        },
      ],
    },
    {
      code: 'jp_precautions',
      title: '使用上の注意 (old umbrella heading)',
      replacedBy: ['8', '9', '10', '11', '12', '13', '14', '15'],
      basis: [
        {
          ref: '薬生発0608第1号 — old-format umbrella heading replaced by numbered items',
          confidence: 'recall',
          url: 'https://www.pmda.go.jp/files/000218446.pdf',
          note: 'no one-to-one new item; its content moves to the numbered precaution items',
        },
      ],
    },
  ],
};

/** Market-level notes surfaced with the requirements and the assessment. */
export const LABELING_NOTES: Partial<Record<LabelMarket, string[]>> = {
  PMDA: [
    'Since 2021-08-01 (薬生発0611第1号) the package insert is published electronically on the PMDA website rather than packed with the product.',
    'The 2026-04-30 notice 医薬安発0430第1号, which amends 「医療用医薬品の添付文書等の記載要領の留意事項について」等, exists but its content has not been read; its effective date is unverified and nothing in this checklist reflects it.',
    'Drugs only: Japanese medical-device and IVD package inserts follow separate drafting rules that are not modelled here.',
    'Items 9.5–9.8, 10.1/10.2, 15–26, the header items, the always-present set and the abolition of 慎重投与 are recall until 000805981.pdf / 000218446.pdf is re-read.',
  ],
};

/** A section with its effective requirement, sub-items included. */
export type FlatLabelingSection = LabelingSection & { requirement: LabelingRequirement };

/**
 * Every section, depth first, with its effective requirement: absent means
 * 'required', and a sub-item of a conditional item is conditional.
 */
export function flattenLabelingSections(sections: LabelingSection[], parentConditional = false): FlatLabelingSection[] {
  const out: FlatLabelingSection[] = [];
  for (const s of sections) {
    const requirement: LabelingRequirement = parentConditional || s.requirement === 'conditional' ? 'conditional' : 'required';
    out.push({ ...s, requirement });
    if (s.children) out.push(...flattenLabelingSections(s.children, requirement === 'conditional'));
  }
  return out;
}

/** Required labeling document sections for an approved medicine, by market. */
export const LABELING_REQUIREMENTS: Record<LabelMarket, LabelingSection[]> = {
  // FDA US Prescribing Information (PI) — 21 CFR 201.56/201.57.
  // BOXED WARNING is intentionally omitted: it is required only when applicable.
  FDA: [
    { code: 'us_highlights', title: 'Highlights of Prescribing Information' },
    { code: 'us_indications_usage', title: 'Indications and Usage' },
    { code: 'us_dosage_administration', title: 'Dosage and Administration' },
    { code: 'us_dosage_forms_strengths', title: 'Dosage Forms and Strengths' },
    { code: 'us_contraindications', title: 'Contraindications' },
    { code: 'us_warnings_precautions', title: 'Warnings and Precautions' },
    { code: 'us_adverse_reactions', title: 'Adverse Reactions' },
    { code: 'us_drug_interactions', title: 'Drug Interactions' },
    { code: 'us_use_specific_populations', title: 'Use in Specific Populations' },
    { code: 'us_overdosage', title: 'Overdosage' },
    { code: 'us_description', title: 'Description' },
    { code: 'us_clinical_pharmacology', title: 'Clinical Pharmacology' },
    { code: 'us_nonclinical_toxicology', title: 'Nonclinical Toxicology' },
    { code: 'us_clinical_studies', title: 'Clinical Studies' },
    { code: 'us_how_supplied_storage', title: 'How Supplied/Storage and Handling' },
    { code: 'us_patient_counseling', title: 'Patient Counseling Information' },
  ],
  // EMA Summary of Product Characteristics (SmPC) — QRD template,
  // Directive 2001/83/EC Art. 11. Numbered sections 1–10 (section 4 expanded).
  EMA: [
    { code: 'eu_1_name', title: '1. Name of the medicinal product' },
    { code: 'eu_2_composition', title: '2. Qualitative and quantitative composition' },
    { code: 'eu_3_pharmaceutical_form', title: '3. Pharmaceutical form' },
    { code: 'eu_4_clinical_particulars', title: '4. Clinical particulars' },
    { code: 'eu_4_1_indications', title: '4.1 Therapeutic indications' },
    { code: 'eu_4_2_posology', title: '4.2 Posology and method of administration' },
    { code: 'eu_4_3_contraindications', title: '4.3 Contraindications' },
    { code: 'eu_4_4_special_warnings', title: '4.4 Special warnings and precautions for use' },
    { code: 'eu_4_5_interactions', title: '4.5 Interaction with other medicinal products and other forms of interaction' },
    { code: 'eu_4_6_pregnancy_lactation', title: '4.6 Fertility, pregnancy and lactation' },
    { code: 'eu_4_7_driving', title: '4.7 Effects on ability to drive and use machines' },
    { code: 'eu_4_8_undesirable_effects', title: '4.8 Undesirable effects' },
    { code: 'eu_4_9_overdose', title: '4.9 Overdose' },
    { code: 'eu_5_pharmacological_properties', title: '5. Pharmacological properties' },
    { code: 'eu_6_pharmaceutical_particulars', title: '6. Pharmaceutical particulars' },
    { code: 'eu_7_ma_holder', title: '7. Marketing authorisation holder' },
    { code: 'eu_8_ma_number', title: '8. Marketing authorisation number(s)' },
    { code: 'eu_9_date_first_authorisation', title: '9. Date of first authorisation/renewal of the authorisation' },
    { code: 'eu_10_date_revision', title: '10. Date of revision of the text' },
  ],
  // PMDA Japanese prescription-drug package insert (添付文書), numbered new
  // format — see JP_PACKAGE_INSERT above.
  PMDA: JP_PACKAGE_INSERT,
};

export type LabelingFindingSeverity = 'error' | 'warning';

export interface LabelingFinding {
  severity: LabelingFindingSeverity;
  /** MISSING_SECTION / FORMAT_OBSOLETE / EXTRA_SECTION / UNKNOWN_MARKET. */
  code: string;
  message: string;
  /** The section code the finding concerns, when applicable. */
  section?: string;
}

export interface LabelingResult {
  market: LabelMarket;
  ready: boolean;
  /** Every modeled section for the market, each with its `requirement` (absent = required). */
  required: LabelingSection[];
  /** Codes of required (not conditional) sections the sponsor has not provided. */
  missing: string[];
  findings: LabelingFinding[];
  counts: { errors: number; warnings: number };
  /** Market-level notes (LABELING_NOTES); empty when there are none. */
  notes: string[];
}

export interface LabelingInput {
  market: LabelMarket;
  /** Section codes the sponsor has drafted (from LABELING_REQUIREMENTS). */
  providedSections: string[];
}

/**
 * Assess a sponsor's labeling sections against the market's modeled set.
 * A missing required section is a blocking MISSING_SECTION; a missing
 * conditional section is not a finding (PMDA: a missing number). A provided
 * heading the format abolished is a blocking FORMAT_OBSOLETE naming the
 * replacement item; any other unrecognized code is an informational
 * EXTRA_SECTION warning. ready ⇔ no errors.
 * Pure / deterministic; findings ordered by section code then severity.
 */
export function assessLabeling(input: LabelingInput): LabelingResult {
  const sections = LABELING_REQUIREMENTS[input.market];

  if (!sections) {
    return {
      market: input.market,
      ready: false,
      required: [],
      missing: [],
      findings: [{ severity: 'error', code: 'UNKNOWN_MARKET', message: `No labeling requirements modeled for market "${input.market}".` }],
      counts: { errors: 1, warnings: 0 },
      notes: [],
    };
  }

  const flat = flattenLabelingSections(sections);
  const provided = new Set((input.providedSections ?? []).map((s) => String(s)));
  const modeledCodes = new Set(flat.map((r) => r.code));
  const obsolete = new Map((OBSOLETE_LABELING_SECTIONS[input.market] ?? []).map((o) => [o.code, o]));
  const byNumber = new Map(flat.filter((s) => s.number !== undefined).map((s) => [s.number as string, s]));

  const findings: LabelingFinding[] = [];
  const missing: string[] = [];

  for (const section of flat) {
    if (section.requirement === 'required' && !provided.has(section.code)) {
      missing.push(section.code);
      findings.push({ severity: 'error', code: 'MISSING_SECTION', message: `Missing required labeling section: ${section.title}.`, section: section.code });
    }
  }

  for (const code of provided) {
    if (modeledCodes.has(code)) continue;
    const old = obsolete.get(code);
    if (old) {
      const replacement = old.replacedBy
        .map((n) => {
          const item = byNumber.get(n);
          return item ? `${n} ${item.title}` : n;
        })
        .join('; ');
      findings.push({
        severity: 'error',
        code: 'FORMAT_OBSOLETE',
        message: `"${old.title}" is a heading the current ${input.market} format abolished; move its content to item ${replacement}.`,
        section: code,
      });
      continue;
    }
    findings.push({ severity: 'warning', code: 'EXTRA_SECTION', message: `Provided section "${code}" is not in the ${input.market} labeling set; confirm placement.`, section: code });
  }

  findings.sort((a, b) => {
    const sa = a.section ?? '';
    const sb = b.section ?? '';
    if (sa !== sb) return sa.localeCompare(sb);
    return a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1;
  });

  const errors = findings.filter((f) => f.severity === 'error').length;

  return {
    market: input.market,
    ready: errors === 0,
    required: sections,
    missing,
    findings,
    counts: { errors, warnings: findings.length - errors },
    notes: getLabelingNotes(input.market),
  };
}

/** List the labeling sections for a market, each with its requirement (for a checklist UI). */
export function getLabelingRequirements(market: LabelMarket): LabelingSection[] {
  return LABELING_REQUIREMENTS[market] ?? [];
}

/** Market-level notes (e.g. PMDA electronic publication, unread amendments); [] when none. */
export function getLabelingNotes(market: LabelMarket): string[] {
  return [...(LABELING_NOTES[market] ?? [])];
}
